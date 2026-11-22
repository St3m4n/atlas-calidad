const bcrypt = require("bcryptjs");

/**
 * R-03 / NFR-SEG-2 (Corrección 3 de la segunda entrega):
 * las contraseñas se guardan con hash bcrypt y nunca en texto plano.
 * Se usa costo 10, el mismo de la migración de las cuentas existentes
 * (sql/migracion-bcrypt.sql).
 */
const COSTO_BCRYPT = 10;

function hashContrasena(contrasena) {
  return bcrypt.hash(contrasena, COSTO_BCRYPT);
}

/**
 * Compara la contraseña ingresada con el hash guardado.
 * Un valor guardado que no sea un hash bcrypt (por ejemplo, una contraseña
 * antigua en texto plano) nunca se acepta.
 */
async function verificarContrasena(contrasena, hashGuardado) {
  if (typeof hashGuardado !== "string" || !hashGuardado.startsWith("$2")) {
    return false;
  }
  return bcrypt.compare(contrasena, hashGuardado);
}

module.exports = { hashContrasena, verificarContrasena, COSTO_BCRYPT };
