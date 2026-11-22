const express = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { responderError } = require("../middleware/errores");
const { verificarContrasena } = require("../utils/contrasenas");
const { opcionesLimiteEnlace } = require("../middleware/limites");

const router = express.Router();

// R-08 / DEF-006: la contraseña del enlace se compara contra su hash bcrypt y
// llega siempre en el cuerpo de una petición POST. Antes se comparaba en texto
// plano y, para ver los archivos, viajaba en la URL (?password=), donde queda
// guardada en registros del servidor, en el historial del navegador y en proxies.
const limiteEnlace = rateLimit(opcionesLimiteEnlace());

// Revisa el enlace y la contraseña. Si algo falla responde y entrega null;
// si todo está bien entrega el contrato.
async function contratoCompartidoVerificado(req, res) {
  const { token } = req.params;
  const { password } = req.body || {};

  if (!password) {
    res.status(400).json({
      error: "Contraseña requerida",
      glosa: "Debe proporcionar una contraseña",
    });
    return null;
  }

  const result = await pool.query(
    `SELECT
      c.id,
      c.titulo,
      c.descripcion,
      c.fecha_inicio,
      c.fecha_fin,
      c.share_password_hash,
      c.share_enabled,
      cl.nombre AS cliente_nombre
    FROM contratos c
    INNER JOIN clientes cl ON cl.id = c.cliente_id
    WHERE c.share_token = $1`,
    [token]
  );

  if (result.rows.length === 0) {
    res.status(404).json({
      error: "Contrato no encontrado",
      glosa: "El enlace compartido no es válido o ha sido desactivado",
    });
    return null;
  }

  const contrato = result.rows[0];

  if (!contrato.share_enabled) {
    res.status(403).json({
      error: "Enlace desactivado",
      glosa: "Este enlace compartido ha sido desactivado",
    });
    return null;
  }

  const contrasenaValida = await verificarContrasena(String(password), contrato.share_password_hash);
  if (!contrasenaValida) {
    res.status(401).json({
      error: "Contraseña incorrecta",
      glosa: "La contraseña proporcionada no es correcta",
    });
    return null;
  }

  return contrato;
}

// Verifica la contraseña y entrega la información del contrato
router.post("/:token/verify", limiteEnlace, async (req, res) => {
  try {
    const contrato = await contratoCompartidoVerificado(req, res);
    if (!contrato) return;

    // Solo datos que se pueden mostrar (sin el hash ni el token)
    res.json({
      id: contrato.id,
      titulo: contrato.titulo,
      descripcion: contrato.descripcion,
      fecha_inicio: contrato.fecha_inicio,
      fecha_fin: contrato.fecha_fin,
      cliente_nombre: contrato.cliente_nombre,
      verified: true,
    });
  } catch (err) {
    return responderError(res, err, "Error al verificar contraseña");
  }
});

// Lista los archivos del contrato compartido
router.post("/:token/files", limiteEnlace, async (req, res) => {
  try {
    const contrato = await contratoCompartidoVerificado(req, res);
    if (!contrato) return;

    const docs = await pool.query(
      "SELECT id, nombre_archivo, created_at FROM documentos_contrato WHERE contract_id=$1 ORDER BY created_at DESC",
      [contrato.id]
    );

    res.json(docs.rows);
  } catch (err) {
    return responderError(res, err, "Error al obtener archivos");
  }
});

// Entrega un archivo del contrato compartido
router.post("/:token/file/:fileId", limiteEnlace, async (req, res) => {
  try {
    const contrato = await contratoCompartidoVerificado(req, res);
    if (!contrato) return;

    // El archivo debe pertenecer al contrato del enlace
    const doc = await pool.query(
      "SELECT document, nombre_archivo FROM documentos_contrato WHERE id=$1 AND contract_id=$2",
      [req.params.fileId, contrato.id]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({
        error: "Archivo no encontrado",
        glosa: "El archivo solicitado no existe o no pertenece a este contrato",
      });
    }

    const buffer = doc.rows[0].document;
    const nombreArchivo = doc.rows[0].nombre_archivo || "contrato.pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nombreArchivo}"`);
    res.send(buffer);
  } catch (err) {
    return responderError(res, err, "Error al obtener archivo");
  }
});

module.exports = router;
