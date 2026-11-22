// PRUEBAS UNITARIAS - Manejo central de errores (DEF-004 y R-04)
// Se prueba el manejador con peticiones y respuestas simuladas, sin servidor.
const multer = require("multer");
const { manejarErrores, responderError } = require("../../src/middleware/errores");

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

// R-04 y DEF-005: errores de PostgreSQL causados por datos del cliente
const errorBD = (code, message) => Object.assign(new Error(message), { code });

describe("R-04 y DEF-005 responderError", () => {
  test.each([
    ["22P02", 400, 'invalid input syntax for type bigint: "abc"'],
    ["23502", 400, 'null value in column "accion" violates not-null constraint'],
    ["23505", 409, 'duplicate key value violates unique constraint "clientes_correo_key"'],
    ["23503", 409, 'update or delete on table "clientes" violates foreign key constraint'],
  ])("Código %s -> %i con mensaje genérico y sin el texto de PostgreSQL", (code, estado, mensaje) => {
    const res = respuestaFalsa();
    responderError(res, errorBD(code, mensaje), "Error al crear cliente");
    expect(res.status).toHaveBeenCalledWith(estado);
    const cuerpo = res.json.mock.calls[0][0];
    expect(cuerpo.error).toBe("Error al crear cliente");
    expect(JSON.stringify(cuerpo)).not.toMatch(/violates|invalid input|clientes_correo_key|accion/);
  });

  test("Un error inesperado -> 500 genérico, y el detalle queda solo en el registro", () => {
    const res = respuestaFalsa();
    const err = new Error('relation "tabla_secreta" does not exist');
    responderError(res, err, "Error al listar clientes");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/tabla_secreta/);
    expect(console.error).toHaveBeenCalledWith(err);
  });

  test("Sin título usa uno genérico", () => {
    const res = respuestaFalsa();
    responderError(res, new Error("x"));
    expect(res.json.mock.calls[0][0].error).toBe("Error interno");
  });

  test("manejarErrores también traduce un error de PostgreSQL que llega con next(err)", () => {
    const res = respuestaFalsa();
    manejarErrores(errorBD("22P02", "invalid input syntax"), peticion("application/json"), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
