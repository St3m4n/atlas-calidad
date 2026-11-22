// PRUEBAS UNITARIAS - Manejo central de errores (DEF-004 y R-04)
// Se prueba el manejador con peticiones y respuestas simuladas, sin servidor.
const multer = require("multer");
const { manejarErrores } = require("../../src/middleware/errores");

function respuestaFalsa() {
  const res = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function peticion(tipo) {
  return { is: (t) => (t === tipo ? tipo : false) };
}

beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test("Archivo demasiado grande -> 413 con mensaje en español", () => {
  const res = respuestaFalsa();
  manejarErrores(new multer.MulterError("LIMIT_FILE_SIZE"), peticion("multipart/form-data"), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(413);
  expect(res.json.mock.calls[0][0].glosa).toMatch(/10 MB/);
});

test("Demasiados archivos -> 400", () => {
  const res = respuestaFalsa();
  manejarErrores(new multer.MulterError("LIMIT_UNEXPECTED_FILE"), peticion("multipart/form-data"), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
});

test("Multipart cortado (error del lector, sin código) -> 400 y no 500", () => {
  const res = respuestaFalsa();
  manejarErrores(new Error("Unexpected end of form"), peticion("multipart/form-data"), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].error).toBe("Solicitud mal formada");
});

test("JSON mal escrito (error 400 de Express) -> 400 en JSON", () => {
  const err = Object.assign(new SyntaxError("Unexpected token"), { status: 400, type: "entity.parse.failed" });
  const res = respuestaFalsa();
  manejarErrores(err, peticion("application/json"), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
});

test("R-04: un error inesperado responde 500 sin el detalle interno", () => {
  const res = respuestaFalsa();
  manejarErrores(new Error("relation \"tabla_secreta\" does not exist"), peticion("application/json"), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(500);
  const cuerpo = JSON.stringify(res.json.mock.calls[0][0]);
  expect(cuerpo).not.toMatch(/tabla_secreta/);
});

test("Si la respuesta ya empezó, se delega en Express", () => {
  const res = respuestaFalsa();
  res.headersSent = true;
  const next = jest.fn();
  const err = new Error("x");
  manejarErrores(err, peticion("application/json"), res, next);
  expect(next).toHaveBeenCalledWith(err);
  expect(res.status).not.toHaveBeenCalled();
});
