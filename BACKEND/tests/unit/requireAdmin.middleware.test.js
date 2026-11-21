// PRUEBA UNITARIA CON SIMULACIONES (mocks) - DEF-02
// Probamos el control de acceso por rol sin servidor ni base de datos.
const jwt = require("jsonwebtoken");
const requireAdmin = require("../../src/middleware/requireAdmin");

function crearRespuestaFalsa() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function peticionCon(payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET);
  return { headers: { authorization: `Bearer ${token}` } };
}

test("Sin encabezado Authorization -> 401", () => {
  const res = crearRespuestaFalsa();
  const next = jest.fn();
  requireAdmin({ headers: {} }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test("Token firmado con otra clave -> 401", () => {
  const token = jwt.sign({ empresaId: 1, rolNombre: "administrador" }, "otra-clave");
  const res = crearRespuestaFalsa();
  const next = jest.fn();
  requireAdmin({ headers: { authorization: `Bearer ${token}` } }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test("Token sin empresa asociada -> 401", () => {
  const res = crearRespuestaFalsa();
  const next = jest.fn();
  requireAdmin(peticionCon({ rolNombre: "administrador" }), res, next);
  expect(res.status).toHaveBeenCalledWith(401);
});

test("Usuario editor -> 403", () => {
  const res = crearRespuestaFalsa();
  const next = jest.fn();
  requireAdmin(peticionCon({ empresaId: 1, rolNombre: "editor" }), res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test("Usuario administrador -> deja pasar y guarda el usuario", () => {
  const req = peticionCon({ empresaId: 1, rolNombre: "administrador", nombreUsuario: "admin" });
  const res = crearRespuestaFalsa();
  const next = jest.fn();
  requireAdmin(req, res, next);
  expect(next).toHaveBeenCalled();
  expect(req.authUser.nombreUsuario).toBe("admin");
});
