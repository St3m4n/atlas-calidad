const express = require('express');
const { pool } = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const router = express.Router();

// DEF-03: solo un administrador puede crear roles (ZAP los creaba sin token)
router.post('/', requireAdmin, async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query('INSERT INTO roles (nombre) VALUES ($1) RETURNING *', [nombre]);

    await pool.query('INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)', [
      req.authUser.nombreUsuario,
      `ROLES_CREAR: creó rol ${nombre}`,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear rol', glosa: err.message || err.toString() });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar roles', glosa: err.message || err.toString() });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener rol', glosa: err.message || err.toString() });
  }
});

// DEF-03: solo un administrador puede modificar roles
router.put('/:id', requireAdmin, async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query('UPDATE roles SET nombre=$1 WHERE id=$2 RETURNING *', [nombre, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

    await pool.query('INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)', [
      req.authUser.nombreUsuario,
      `ROLES_ACTUALIZAR: actualizó rol ID ${req.params.id}`,
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar rol', glosa: err.message || err.toString() });
  }
});

// DEF-02: solo un administrador puede eliminar roles
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM roles WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

    await pool.query('INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)', [
      req.authUser.nombreUsuario,
      `ROLES_ELIMINAR: eliminó rol ID ${req.params.id}`,
    ]);

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar rol', glosa: err.message || err.toString() });
  }
});

module.exports = router;


