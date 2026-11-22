const jwt = require("jsonwebtoken");

/**
 * Control de acceso central del backend (NFR-SEG-4, RB-2, RB-4 y RB-5).
 * Es el único lugar que firma y verifica los tokens de sesión (R-06).
 *
 * firmarToken: crea el token de sesión que entrega el inicio de sesión.
 * getUserFromAuthHeader: lee y verifica el token "Bearer" del encabezado
 * Authorization. Devuelve los datos de la sesión o null.
 *
 * requireAuth: exige una sesión válida con empresa asociada (401 si no).
 * requireAdmin: además exige el rol "administrador" (403 si no lo tiene).
 * Ambos dejan la sesión en req.authUser.
 */

// R-01: la clave de los tokens viene SIEMPRE de la variable JWT_SECRET. Si falta,
// es corta o es un valor de ejemplo conocido, la API no inicia. Antes se usaba
// «inseguro» y cualquiera podía fabricar un token de administrador.
const LARGO_MINIMO_CLAVE = 32;
const CLAVES_CONOCIDAS = [
  "inseguro",
  "escribe-aqui-una-clave-larga-y-aleatoria",
  "your-secret-key-change-in-production",
];
const DURACION_SESION = "2h";

function leerClaveJwt() {
  const clave = process.env.JWT_SECRET;
  if (!clave || clave.length < LARGO_MINIMO_CLAVE || CLAVES_CONOCIDAS.includes(clave)) {
    throw new Error(
      `Falta JWT_SECRET o no es segura: define en el archivo .env una clave aleatoria de al menos ${LARGO_MINIMO_CLAVE} caracteres (ver .env.example)`
    );
  }
  return clave;
}

const JWT_SECRET = leerClaveJwt();

function firmarToken(datos) {
  return jwt.sign(datos, JWT_SECRET, { algorithm: "HS256", expiresIn: DURACION_SESION });
}

function getUserFromAuthHeader(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.substring(7), JWT_SECRET, { algorithms: ["HS256"] });
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

module.exports = { firmarToken, getUserFromAuthHeader, requireAuth, requireAdmin };
