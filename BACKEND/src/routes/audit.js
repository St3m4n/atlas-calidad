const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// DEF-002: solo un usuario con sesión escribe en la bitácora, y queda registrado
// con el nombre de su token (antes cualquiera podía escribir sin iniciar sesión)
router.post("/", requireAuth, async (req, res) => {
  const { accion, detalles } = req.body;
  try {
    const authUser = req.authUser;
    const actionText = detalles ? `${accion}: ${detalles}` : accion;
    const result = await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2) RETURNING *",
      [authUser.nombreUsuario, actionText]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar log", glosa: err.message || err.toString() });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const authUser = req.authUser;

    const result = await pool.query(
      `SELECT a.* FROM auditoria a
       INNER JOIN usuarios u ON u.nombre_usuario = a.usuario_id
       INNER JOIN empresa_usuarios eu ON eu.usuario_id = u.id
       WHERE eu.empresa_id = $1
       ORDER BY a.id DESC`,
      [authUser.empresaId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar logs", glosa: err.message || err.toString() });
  }
});

module.exports = router;
