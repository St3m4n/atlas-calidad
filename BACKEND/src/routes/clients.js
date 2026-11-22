const express = require("express");
const { pool } = require("../db");
const { responderError } = require("../middleware/errores");
const { listarDeLaEmpresa } = require("../utils/listados");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { clienteSchema } = require("../validations/clients");
const router = express.Router();

// R-06: los datos del cliente se leen igual al crear y al actualizar
// (antes la lista de los 25 campos estaba repetida en las dos rutas).
// El orden es el de las columnas en el INSERT y el UPDATE.
const CAMPOS_CLIENTE = [
  "nombre", "correo", "telefono", "direccion",
  "es_empresa", "nombre_banco", "numero_cuenta", "titular_cuenta",
  "rut", "nombre_fantasia", "giro_actividad_economica", "nombre_representante",
  "cargo_representante", "correo_representante", "telefono_representante", "relacion_representante",
  "direccion_calle", "direccion_numero", "direccion_ciudad", "direccion_region",
  "sitio_web", "telefono_corporativo", "metodo_pago", "dia_pago",
  "moneda",
];

// Valores enviados, en el orden de CAMPOS_CLIENTE. Un campo que no viene queda
// en null, salvo es_empresa, que queda en false.
function valoresDelCliente(datos) {
  return CAMPOS_CLIENTE.map((campo) => datos[campo] ?? (campo === "es_empresa" ? false : null));
}

router.post("/", requireAuth, validate(clienteSchema), async (req, res) => {
  try {
    const authUser = req.authUser;

    const empresaId = authUser.empresaId;

    const result = await pool.query(
      `INSERT INTO clientes (
        nombre, correo, telefono, direccion, es_empresa, nombre_banco, numero_cuenta, titular_cuenta,
        rut, nombre_fantasia, giro_actividad_economica,
        nombre_representante, cargo_representante, correo_representante, telefono_representante, relacion_representante,
        direccion_calle, direccion_numero, direccion_ciudad, direccion_region, sitio_web, telefono_corporativo,
        metodo_pago, dia_pago, moneda,
        empresa_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING *`,
      [...valoresDelCliente(req.body), empresaId]
    );

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        authUser?.nombreUsuario || null,
        `CLIENTES_CREAR: creó cliente ${req.body.nombre}`,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    return responderError(res, err, "Error al crear cliente");
  }
});

router.get("/", requireAuth, listarDeLaEmpresa("Error al listar clientes", "SELECT * FROM clientes WHERE empresa_id = $1 ORDER BY id DESC"));

router.get("/search", requireAuth, async (req, res) => {
  const { name } = req.query;
  try {
    const authUser = req.authUser;

    const result = await pool.query(
      "SELECT * FROM clientes WHERE nombre ILIKE $1 AND empresa_id = $2 ORDER BY nombre ASC",
      [`%${name || ""}%`, authUser.empresaId]
    );
    res.json(result.rows);
  } catch (err) {
    return responderError(res, err, "Error en búsqueda");
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const authUser = req.authUser;

    const result = await pool.query(
      "SELECT * FROM clientes WHERE id=$1 AND empresa_id = $2",
      [req.params.id, authUser.empresaId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    return responderError(res, err, "Error al obtener cliente");
  }
});

router.put("/:id", requireAuth, validate(clienteSchema), async (req, res) => {
  try {
    const authUser = req.authUser;

    const result = await pool.query(
      `UPDATE clientes SET 
        nombre=$1, correo=$2, telefono=$3, direccion=$4, es_empresa=$5, nombre_banco=$6, numero_cuenta=$7, titular_cuenta=$8,
        rut=$9, nombre_fantasia=$10, giro_actividad_economica=$11,
        nombre_representante=$12, cargo_representante=$13, correo_representante=$14, telefono_representante=$15, relacion_representante=$16,
        direccion_calle=$17, direccion_numero=$18, direccion_ciudad=$19, direccion_region=$20, sitio_web=$21, telefono_corporativo=$22,
        metodo_pago=$23, dia_pago=$24, moneda=$25
      WHERE id=$26 AND empresa_id = $27 RETURNING *`,
      [...valoresDelCliente(req.body), req.params.id, authUser.empresaId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        authUser?.nombreUsuario || null,
        `CLIENTES_ACTUALIZAR: actualizó cliente ID ${req.params.id}`,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    return responderError(res, err, "Error al actualizar cliente");
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const authUser = req.authUser;

    // RB-4 / RB-5: solo un administrador puede eliminar clientes
    if (authUser.rolNombre !== "administrador") {
      return res.status(403).json({
        error: "Acción no permitida",
        glosa: "Solo un administrador puede eliminar clientes",
      });
    }

    const result = await pool.query(
      "DELETE FROM clientes WHERE id=$1 AND empresa_id = $2 RETURNING *",
      [req.params.id, authUser.empresaId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "No encontrado" });

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [
        authUser?.nombreUsuario || null,
        `CLIENTES_ELIMINAR: eliminó cliente ID ${req.params.id}`,
      ]
    );

    res.json({ deleted: true });
  } catch (err) {
    return responderError(res, err, "Error al eliminar cliente");
  }
});

module.exports = router;
