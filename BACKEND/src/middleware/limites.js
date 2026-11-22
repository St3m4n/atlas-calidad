// Límites de peticiones (hallazgo de CodeQL js/missing-rate-limiting).
// Aquí solo se arman las opciones; el limitador se crea con rateLimit() en
// app.js y en routes/auth.js. Los valores se pueden cambiar con variables de
// entorno, por ejemplo para el perfil "carga" de k6, que simula 200 personas
// desde un mismo equipo.
const { ipKeyGenerator } = require("express-rate-limit");

const UN_MINUTO = 60 * 1000;
const QUINCE_MINUTOS = 15 * 60 * 1000;

function leerEntero(nombre, porDefecto) {
  const valor = Number.parseInt(process.env[nombre], 10);
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
}

// Límite general para toda la API: 1000 peticiones por minuto desde una misma IP
function opcionesLimiteGeneral() {
  return {
    windowMs: UN_MINUTO,
    limit: leerEntero("LIMITE_PETICIONES_POR_MINUTO", 1000),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Demasiadas peticiones",
      glosa: "Se superó el límite de peticiones. Espera un minuto y vuelve a intentarlo",
    },
  };
}

// Inicio de sesión: 20 intentos fallidos cada 15 minutos por IP y nombre de usuario
// (80 por hora, bajo el máximo de 100 por hora que indica OWASP ASVS V2.2.1).
// Los inicios de sesión correctos no se cuentan.
function opcionesLimiteLogin() {
  return {
    windowMs: QUINCE_MINUTOS,
    limit: leerEntero("LIMITE_LOGIN_FALLIDOS", 20),
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const usuario = String(req.body?.nombre_usuario || "").toLowerCase();
      return `${ipKeyGenerator(req.ip)}:${usuario}`;
    },
    message: {
      error: "Demasiados intentos",
      glosa: "Demasiados intentos fallidos de inicio de sesión. Espera 15 minutos y vuelve a intentarlo",
    },
  };
}

module.exports = { opcionesLimiteGeneral, opcionesLimiteLogin };
