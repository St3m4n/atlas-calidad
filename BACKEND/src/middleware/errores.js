// Manejo central de errores que llegan a Express sin que una ruta los responda.
// DEF-004: una solicitud multipart mal formada (cuerpo cortado, sin "boundary",
// archivo demasiado grande) terminaba en el manejador por defecto de Express,
// que responde 500 con una página HTML. Ahora se responde 400 o 413 en JSON,
// con el mismo formato { error, glosa } del resto de la API.
// R-04: cualquier otro error responde un mensaje genérico, sin detalles internos.
const multer = require("multer");

const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: "Cada archivo puede pesar como máximo 10 MB",
  LIMIT_FILE_COUNT: "Se pueden adjuntar como máximo 10 archivos",
  LIMIT_UNEXPECTED_FILE: "Se envió un archivo en un campo que no corresponde o se superó el máximo de archivos",
};

// Express reconoce un manejador de errores porque recibe 4 parámetros
function manejarErrores(err, req, res, next) {
  // Si la respuesta ya empezó a enviarse, solo Express puede cerrarla bien
  if (res.headersSent) return next(err);

  const esMultipart = typeof req.is === "function" && req.is("multipart/form-data");

  if (err instanceof multer.MulterError) {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: "Archivo no válido",
      glosa: MENSAJES_MULTER[err.code] || "Los archivos enviados no son válidos",
    });
  }

  // Errores del lector de multipart (por ejemplo "Unexpected end of form")
  if (esMultipart && !err.status) {
    return res.status(400).json({
      error: "Solicitud mal formada",
      glosa: "El formulario con archivos llegó incompleto o con un formato no válido",
    });
  }

  // Errores de cliente que ya traen su código (JSON mal escrito, cuerpo demasiado grande)
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({
      error: "Solicitud no válida",
      glosa: "Los datos enviados no tienen un formato válido",
    });
  }

  console.error(err);
  return res.status(500).json({
    error: "Error interno",
    glosa: "Ocurrió un problema al procesar la solicitud. Intenta nuevamente",
  });
}

module.exports = { manejarErrores };
