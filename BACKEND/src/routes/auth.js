const express = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const validate = require("../middleware/validate");
const { firmarToken } = require("../middleware/auth");
const { loginSchema } = require("../validations/auth");
const { verificarContrasena } = require("../utils/contrasenas");
const { opcionesLimiteLogin } = require("../middleware/limites");
const router = express.Router();

// Freno a los intentos de adivinar contraseñas (fuerza bruta): ver middleware/limites.js
router.post("/login", rateLimit(opcionesLimiteLogin()), validate(loginSchema), async (req, res) => {
  const { nombre_usuario, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT id, nombre_usuario, contrasena_hash FROM usuarios WHERE nombre_usuario = $1",
      [nombre_usuario]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }
    const user = result.rows[0];
    // R-03: se compara contra el hash bcrypt guardado, no contra texto plano
    const contrasenaValida = await verificarContrasena(password, user.contrasena_hash);
    if (!contrasenaValida) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const empresaUsuarioResult = await pool.query(
      `SELECT 
        eu.id, 
        eu.empresa_id, 
        eu.rol_id,
        r.nombre AS rol_nombre
      FROM empresa_usuarios eu
      LEFT JOIN roles r ON r.id = eu.rol_id
      WHERE eu.usuario_id = $1 
      ORDER BY eu.id DESC 
      LIMIT 1`,
      [user.id]
    );
    const empresaUsuarioId = empresaUsuarioResult.rows.length > 0 
      ? empresaUsuarioResult.rows[0].id 
      : null;
    const empresaId = empresaUsuarioResult.rows.length > 0 
      ? empresaUsuarioResult.rows[0].empresa_id 
      : null;
    const rolId = empresaUsuarioResult.rows.length > 0 
      ? empresaUsuarioResult.rows[0].rol_id 
      : null;
    const rolNombre = empresaUsuarioResult.rows.length > 0 
      ? empresaUsuarioResult.rows[0].rol_nombre 
      : null;

    // R-01 y R-06: el token se firma en middleware/auth.js con la clave de JWT_SECRET
    const token = firmarToken({
      usuarioId: user.id,
      nombreUsuario: user.nombre_usuario,
      empresaUsuarioId: empresaUsuarioId,
      empresaId: empresaId,
      rolId: rolId,
      rolNombre: rolNombre,
    });

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [user.nombre_usuario, "LOGIN: usuario inició sesión"]
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Error en login", glosa: err.message || err.toString() });
  }
});

module.exports = router;
