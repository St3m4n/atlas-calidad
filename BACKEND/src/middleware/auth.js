const jwt = require("jsonwebtoken");

/**
 * Control de acceso central del backend (NFR-SEG-4, RB-2, RB-4 y RB-5).
 *
 * getUserFromAuthHeader: lee y verifica el token "Bearer" del encabezado
 * Authorization. Devuelve los datos de la sesión o null.
 *
 * requireAuth: exige una sesión válida con empresa asociada (401 si no).
 * requireAdmin: además exige el rol "administrador" (403 si no lo tiene).
 * Ambos dejan la sesión en req.authUser.
 */
function getUserFromAuthHeader(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.substring(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function noAutorizado(res) {
  return res.status(401).json({
    error: "No autorizado",
    glosa: "Token inválido o sin empresa asociada",
  });
}

function requireAuth(req, res, next) {
  const authUser = getUserFromAuthHeader(req);
  if (!authUser || !authUser.empresaId) return noAutorizado(res);
  req.authUser = authUser;
  return next();
}

function requireAdmin(req, res, next) {
  const authUser = getUserFromAuthHeader(req);
  if (!authUser || !authUser.empresaId) return noAutorizado(res);
  if (authUser.rolNombre !== "administrador") {
    return res.status(403).json({
      error: "Acción no permitida",
      glosa: "Solo un administrador puede realizar esta acción",
    });
  }
  req.authUser = authUser;
  return next();
}

module.exports = { getUserFromAuthHeader, requireAuth, requireAdmin };
