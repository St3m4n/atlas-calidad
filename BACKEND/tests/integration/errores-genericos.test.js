// PRUEBAS DE INTEGRACIÓN - R-04 y DEF-005 (errores sin detalle técnico)
// R-04: las rutas devolvían al cliente el mensaje interno del error (err.message),
// por ejemplo el texto de PostgreSQL con nombres de tablas, columnas y valores.
// DEF-005: datos inválidos terminaban en un error 500. Ahora responden 400 o 409
// con un mensaje genérico, y el detalle solo queda en el registro del servidor.
// La prueba crea su propio cliente con un contrato y los borra al terminar.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");
const {
  conToken,
  iniciarSesion,
  clienteDePrueba,
  crearContratoConPdf,
  borrarContrato,
} = require("../apoyo");

// Textos que delatan detalles internos (mensajes de PostgreSQL o de Node)
const DETALLE_INTERNO =
  /invalid input syntax|violates|duplicate key|constraint|relation "|column "|null value|bigint|SELECT|INSERT|DELETE FROM|at \S+\.js/i;

let token;
let cliente;
let contratoId;

function sinDetalleInterno(res) {
  expect(JSON.stringify(res.body)).not.toMatch(DETALLE_INTERNO);
}

beforeAll(async () => {
  token = await iniciarSesion("admin", "admin");
  cliente = clienteDePrueba(`Cliente R04 ${Date.now()}`);
  const creado = await request(app).post("/clientes").set(conToken(token)).send(cliente);
  cliente.id = creado.body.id;
  ({ contratoId } = await crearContratoConPdf(token, {
    clienteId: cliente.id,
    titulo: `Contrato R04 ${Date.now()}`,
    pdf: Buffer.from("%PDF-1.4\n% R-04\n"),
    nombreArchivo: "r04.pdf",
  }));
});

afterAll(async () => {
  await borrarContrato(contratoId);
  if (cliente?.id) await pool.query("DELETE FROM clientes WHERE id = $1", [cliente.id]);
  await pool.end();
});

describe("R-04 Un número de registro que no es un número responde 400 sin detalle interno", () => {
  test.each(["/clientes/abc", "/contratos/abc", "/usuarios/abc", "/roles/abc", "/empresa-usuarios/abc"])(
    "GET %s -> 400 (antes, 500 con el texto de PostgreSQL)",
    async (ruta) => {
      const res = await request(app).get(ruta).set(conToken(token));
      expect(res.status).toBe(400);
      expect(res.body.glosa).toBeDefined();
      sinDetalleInterno(res);
    }
  );
});

describe("DEF-005 Datos que la base de datos rechaza responden 400 o 409, no 500", () => {
  test("Registrar en la bitácora sin acción -> 400", async () => {
    const res = await request(app).post("/auditoria").set(conToken(token)).send({});
    expect(res.status).toBe(400);
    sinDetalleInterno(res);
  });

  test("Crear un cliente con un correo que ya existe -> 409", async () => {
    const repetido = { ...clienteDePrueba(`Cliente R04 repetido ${Date.now()}`), correo: cliente.correo };
    const res = await request(app).post("/clientes").set(conToken(token)).send(repetido);
    expect(res.status).toBe(409);
    sinDetalleInterno(res);
  });

  test("Eliminar un cliente que tiene contratos -> 409 y el cliente se mantiene", async () => {
    const res = await request(app).delete(`/clientes/${cliente.id}`).set(conToken(token));
    expect(res.status).toBe(409);
    sinDetalleInterno(res);
    const sigue = await request(app).get(`/clientes/${cliente.id}`).set(conToken(token));
    expect(sigue.status).toBe(200);
  });
});
