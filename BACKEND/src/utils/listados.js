// R-06: las rutas que listan los registros de la empresa del usuario repetían el
// mismo bloque (leer la sesión, consultar con su empresa, responder las filas y
// manejar el error). Ahora todas usan esta función.
const { pool } = require("../db");

// Crea el manejador de una ruta que lista los registros de la empresa de la sesión.
// La consulta recibe la empresa como $1; requireAuth debe ir antes en la ruta.
function listarDeLaEmpresa(tituloError, consulta) {
  return async (req, res) => {
    try {
      const result = await pool.query(consulta, [req.authUser.empresaId]);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: tituloError, glosa: err.message || err.toString() });
    }
  };
}

module.exports = { listarDeLaEmpresa };
