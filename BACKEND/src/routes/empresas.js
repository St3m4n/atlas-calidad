const express = require("express");
const { pool } = require("../db");
const { responderError } = require("../middleware/errores");
const validate = require("../middleware/validate");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const {
  createEmpresaSchema,
  createEmpresaConUsuarioSchema,
  updateEmpresaSchema,
} = require("../validations/empresas");
const { hashContrasena } = require("../utils/contrasenas");

const router = express.Router();

// El registro público (usuario + empresa nueva) no exige sesión; crear una empresa
// suelta sí exige ser administrador (DEF-05: antes cualquiera podía crearla)
function registroPublicoOAdministrador(req, res, next) {
  if (req.body && req.body.usuario && req.body.empresa) return next();
  return requireAdmin(req, res, next);
}

router.post("/", registroPublicoOAdministrador, async (req, res) => {
  if (req.body.usuario && req.body.empresa) {
    try {
      await createEmpresaConUsuarioSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    } catch (error) {
      if (error.name === "ValidationError") {
        const errors = error.inner.map((err) => ({
          field: err.path,
          message: err.message,
        }));
        return res.status(400).json({
          error: "Error de validación",
          glosa: "Los datos proporcionados no son válidos",
          detalles: errors,
        });
      }
      return responderError(res, error, "Error en la validación");
    }
    const { usuario, empresa } = req.body;
    const { nombre_usuario, contrasena_hash, correo: correoUsuario } = usuario;
    const { nombre, direccion = null, telefono = null, correo } = empresa;

    try {
      const usuarioResult = await pool.query(
        "INSERT INTO usuarios (nombre_usuario, contrasena_hash, correo) VALUES ($1, $2, $3) RETURNING id, nombre_usuario, correo, created_at",
        [nombre_usuario, await hashContrasena(contrasena_hash), correoUsuario]
      );
      const usuarioId = usuarioResult.rows[0].id;

      const empresaResult = await pool.query(
        "INSERT INTO empresas (nombre, direccion, telefono, correo) VALUES ($1, $2, $3, $4) RETURNING *",
        [nombre, direccion, telefono, correo]
      );
      const empresaId = empresaResult.rows[0].id;

      await pool.query(
        "INSERT INTO empresa_usuarios (empresa_id, usuario_id, rol_id) VALUES ($1, $2, $3) RETURNING *",
        [empresaId, usuarioId, 1]
      );

      res.status(201).json({
        usuario: usuarioResult.rows[0],
        empresa: empresaResult.rows[0],
      });
    } catch (err) {
      return responderError(res, err, "Error al crear empresa con usuario");
    }
  } else {
    try {
      await createEmpresaSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    } catch (error) {
      if (error.name === "ValidationError") {
        const errors = error.inner.map((err) => ({
          field: err.path,
          message: err.message,
        }));
        return res.status(400).json({
          error: "Error de validación",
          glosa: "Los datos proporcionados no son válidos",
          detalles: errors,
        });
      }
      return responderError(res, error, "Error en la validación");
    }
    const { nombre, direccion = null, telefono = null, correo } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO empresas (nombre, direccion, telefono, correo) VALUES ($1, $2, $3, $4) RETURNING *",
        [nombre, direccion, telefono, correo]
      );

      const authUser = req.authUser; // lo deja requireAdmin (ver registroPublicoOAdministrador)
      await pool.query(
        "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
        [
          authUser?.nombreUsuario || null,
          `EMPRESAS_CREAR: creó empresa ${nombre}`,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      return responderError(res, err, "Error al crear empresa");
    }
  }
});

// DEF-05 (RB-2): cada usuario ve solo las empresas a las que pertenece
// (antes la lista de todas las empresas se entregaba sin sesión)
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.* FROM empresas e
       INNER JOIN empresa_usuarios eu ON eu.empresa_id = e.id
       WHERE eu.usuario_id = $1
       ORDER BY e.id DESC`,
      [req.authUser.usuarioId]
    );
    res.json(result.rows);
  } catch (err) {
    return responderError(res, err, "Error al listar empresas");
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.* FROM empresas e
       INNER JOIN empresa_usuarios eu ON eu.empresa_id = e.id
       WHERE e.id = $1 AND eu.usuario_id = $2`,
      [req.params.id, req.authUser.usuarioId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    return responderError(res, err, "Error al obtener empresa");
  }
});

// DEF-05: solo el administrador de la empresa puede modificarla
// (antes cualquiera podía cambiar los datos de cualquier empresa sin sesión)
router.put("/:id", requireAdmin, validate(updateEmpresaSchema), async (req, res) => {
  const { nombre, direccion = null, telefono = null, correo } = req.body;
  try {
    if (Number(req.params.id) !== Number(req.authUser.empresaId)) {
      return res.status(404).json({ error: "No encontrado" });
    }
    const result = await pool.query(
      "UPDATE empresas SET nombre=$1, direccion=$2, telefono=$3, correo=$4 WHERE id=$5 RETURNING *",
      [nombre, direccion, telefono, correo, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        req.authUser.nombreUsuario,
        `EMPRESAS_ACTUALIZAR: actualizó empresa ID ${req.params.id}`,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    return responderError(res, err, "Error al actualizar empresa");
  }
});

// DEF-02: solo un administrador puede eliminar, y solo su propia empresa
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const authUser = req.authUser;

    if (String(req.params.id) !== String(authUser.empresaId)) {
      return res.status(403).json({
        error: "Acción no permitida",
        glosa: "Solo puedes eliminar la empresa a la que perteneces",
      });
    }

    const result = await pool.query(
      "DELETE FROM empresas WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        authUser.nombreUsuario,
        `EMPRESAS_ELIMINAR: eliminó empresa ID ${req.params.id}`,
      ]
    );

    res.json({ deleted: true });
  } catch (err) {
    return responderError(res, err, "Error al eliminar empresa");
  }
});

module.exports = router;
