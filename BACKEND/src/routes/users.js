const express = require("express");
const { pool } = require("../db");
const { listarDeLaEmpresa } = require("../utils/listados");
const validate = require("../middleware/validate");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { createUserSchema, updateUserSchema } = require("../validations/users");
const { hashContrasena } = require("../utils/contrasenas");

const router = express.Router();

// DEF-001: solo un administrador puede crear usuarios (antes no exigía sesión)
router.post("/", requireAdmin, validate(createUserSchema), async (req, res) => {
  const { nombre_usuario, contrasena_hash, correo } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO usuarios (nombre_usuario, contrasena_hash, correo) VALUES ($1, $2, $3) RETURNING id, nombre_usuario, correo, created_at",
      [nombre_usuario, await hashContrasena(contrasena_hash), correo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error al crear usuario",
      glosa: err.message || err.toString(),
    });
  }
});

router.get("/", requireAuth, listarDeLaEmpresa("Error al listar usuarios", `SELECT DISTINCT u.id, u.nombre_usuario, u.correo, u.created_at 
       FROM usuarios u
       INNER JOIN empresa_usuarios eu ON eu.usuario_id = u.id
       WHERE eu.empresa_id = $1
       ORDER BY u.id DESC`));

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const authUser = req.authUser;

    // Obtener información del usuario y su rol desde empresa_usuarios
    const result = await pool.query(
      `SELECT 
        u.id, 
        u.nombre_usuario, 
        u.correo, 
        u.created_at,
        eu.rol_id,
        r.nombre AS rol_nombre
      FROM usuarios u
      INNER JOIN empresa_usuarios eu ON eu.usuario_id = u.id AND eu.empresa_id = $2
      LEFT JOIN roles r ON r.id = eu.rol_id
      WHERE u.id = $1 AND eu.empresa_id = $2`,
      [req.params.id, authUser.empresaId]
    );
    
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });
    
    const usuario = result.rows[0];
    
    // Verificar si es el único administrador de la empresa
    if (usuario.rol_id === 1) { // 1 = administrador
      const adminCount = await pool.query(
        `SELECT COUNT(*) as count 
         FROM empresa_usuarios 
         WHERE empresa_id = $1 AND rol_id = 1`,
        [authUser.empresaId]
      );
      usuario.es_unico_administrador = parseInt(adminCount.rows[0].count) === 1;
    } else {
      usuario.es_unico_administrador = false;
    }
    
    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error al obtener usuario",
      glosa: err.message || err.toString(),
    });
  }
});

// DEF-05 (RB-5): un administrador edita a los usuarios de su empresa; cualquier
// otro usuario solo puede editar su propia cuenta. Se revisa antes de validar los datos.
function puedeEditarUsuario(req, res, next) {
  const { authUser } = req;
  const esAdministrador = authUser.rolNombre === "administrador";
  const esSuCuenta = Number(authUser.usuarioId) === Number(req.params.id);
  if (!esAdministrador && !esSuCuenta) {
    return res.status(403).json({
      error: "Acción no permitida",
      glosa: "Solo un administrador puede editar a otros usuarios",
    });
  }
  return next();
}

router.put("/:id", requireAuth, puedeEditarUsuario, validate(updateUserSchema), async (req, res) => {
  const { nombre_usuario, contrasena_hash, correo, rol_id } = req.body;
  try {
    const authUser = req.authUser;

    // DEF-05: el usuario editado debe pertenecer a la empresa de quien edita
    // (antes un administrador de otra empresa podía cambiar su correo o su contraseña)
    const vinculo = await pool.query(
      "SELECT rol_id FROM empresa_usuarios WHERE usuario_id = $1 AND empresa_id = $2",
      [req.params.id, authUser.empresaId]
    );
    if (vinculo.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    // Verificar si se está intentando cambiar el rol (enviar el mismo rol no es un cambio:
    // el formulario de la propia cuenta lo envía junto con el correo)
    const cambiaRol = rol_id !== undefined && Number(rol_id) !== Number(vinculo.rows[0].rol_id);
    if (cambiaRol) {
      // Verificar si el usuario está intentando cambiar su propio rol
      if (authUser.usuarioId && Number(authUser.usuarioId) === Number(req.params.id)) {
        return res.status(400).json({
          error: "No se puede cambiar el rol",
          glosa: "No puedes cambiar tu propio rol",
        });
      }
      
      const usuarioActual = await pool.query(
        `SELECT eu.rol_id 
         FROM empresa_usuarios eu
         WHERE eu.usuario_id = $1 AND eu.empresa_id = $2`,
        [req.params.id, authUser.empresaId]
      );
      
      if (usuarioActual.rows.length > 0 && usuarioActual.rows[0].rol_id === 1) {
        // Es administrador, verificar si es el único
        const adminCount = await pool.query(
          `SELECT COUNT(*) as count 
           FROM empresa_usuarios 
           WHERE empresa_id = $1 AND rol_id = 1`,
          [authUser.empresaId]
        );
        
        if (parseInt(adminCount.rows[0].count) === 1 && rol_id !== 1) {
          return res.status(400).json({
            error: "No se puede cambiar el rol",
            glosa: "No se puede cambiar el rol del único administrador de la empresa",
          });
        }
      }
    }

    // Actualizar información del usuario
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (nombre_usuario !== undefined) {
      updateFields.push(`nombre_usuario=$${paramIndex++}`);
      updateValues.push(nombre_usuario);
    }
    if (contrasena_hash !== undefined) {
      updateFields.push(`contrasena_hash=$${paramIndex++}`);
      updateValues.push(await hashContrasena(contrasena_hash));
    }
    if (correo !== undefined) {
      updateFields.push(`correo=$${paramIndex++}`);
      updateValues.push(correo);
    }

    if (updateFields.length > 0) {
      updateValues.push(req.params.id);
      const result = await pool.query(
        `UPDATE usuarios SET ${updateFields.join(", ")} WHERE id=$${paramIndex} RETURNING id, nombre_usuario, correo, created_at`,
        updateValues
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "No encontrado" });
    }

    // Actualizar rol si cambió
    if (cambiaRol) {
      const empresaUsuarioResult = await pool.query(
        `SELECT id FROM empresa_usuarios WHERE usuario_id = $1 AND empresa_id = $2`,
        [req.params.id, authUser.empresaId]
      );
      
      if (empresaUsuarioResult.rows.length > 0) {
        await pool.query(
          `UPDATE empresa_usuarios SET rol_id = $1 WHERE usuario_id = $2 AND empresa_id = $3`,
          [rol_id, req.params.id, authUser.empresaId]
        );
      }
    }

    // Obtener datos actualizados del usuario
    const usuarioResult = await pool.query(
      `SELECT 
        u.id, 
        u.nombre_usuario, 
        u.correo, 
        u.created_at,
        eu.rol_id,
        r.nombre AS rol_nombre
      FROM usuarios u
      LEFT JOIN empresa_usuarios eu ON eu.usuario_id = u.id AND eu.empresa_id = $2
      LEFT JOIN roles r ON r.id = eu.rol_id
      WHERE u.id = $1`,
      [req.params.id, authUser.empresaId]
    );

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        authUser?.nombreUsuario || null,
        `USUARIOS_ACTUALIZAR: actualizó usuario ID ${req.params.id}${cambiaRol ? ` y rol a ${rol_id}` : ""}`,
      ]
    );

    res.json(usuarioResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error al actualizar usuario",
      glosa: err.message || err.toString(),
    });
  }
});

// DEF-02: solo un administrador puede eliminar, y solo usuarios de su empresa
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const authUser = req.authUser;

    const pertenece = await pool.query(
      "SELECT 1 FROM empresa_usuarios WHERE usuario_id=$1 AND empresa_id=$2",
      [req.params.id, authUser.empresaId]
    );
    if (pertenece.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    const result = await pool.query(
      "DELETE FROM usuarios WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        authUser.nombreUsuario,
        `USUARIOS_ELIMINAR: eliminó usuario ID ${req.params.id}`,
      ]
    );

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error al eliminar usuario",
      glosa: err.message || err.toString(),
    });
  }
});

module.exports = router;
