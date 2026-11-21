const jwt = require("jsonwebtoken");

/**
 * Control de acceso en el backend (NFR-SEG-4, RB-4 / RB-5).
 * Deja pasar solo a usuarios autenticados con rol "administrador".
 *  - Sin token, token inválido o sin empresa asociada -> 401
 *  - Usuario autenticado sin rol de administrador     -> 403
 * Si todo está bien, deja el usuario en req.authUser y continúa.
 */
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  let authUser = null;

  if (auth.startsWith("Bearer ")) {
    try {
      authUser = jwt.verify(auth.substring(7), process.env.JWT_SECRET);
    } catch {
      authUser = null;
    }
  }

  if (!authUser || !authUser.empresaId) {
    return res.status(401).json({
      error: "No autorizado",
      glosa: "Token inválido o sin empresa asociada",
    });
  }

  if (authUser.rolNombre !== "administrador") {
    return res.status(403).json({
      error: "Acción no permitida",
      glosa: "Solo un administrador puede realizar esta acción",
    });
  }

  req.authUser = authUser;
  return next();
}

module.exports = requireAdmin;
