// PRUEBAS DE INTEGRACIÓN - R-06 (verificación de sesión en un solo lugar)
// Las rutas que verificaban el token con su propia copia de getUserFromAuthHeader
// ahora usan el middleware requireAuth. Esta prueba recorre esas rutas con una
// sesión válida para comprobar que siguen respondiendo igual que antes.
// (Las respuestas sin sesión se prueban en autorizacion.test.js.)
// Todo lo que crea (cliente, contrato, empresa) lo borra al terminar.
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const { pool } = require("../../src/db");
const { iniciarSesion, clienteDePrueba, crearContratoConPdf, borrarContrato } = require("../apoyo");

const SUFIJO = Date.now();
const PDF_DE_PRUEBA = Buffer.from("%PDF-1.4\n% documento de prueba R-06\n");

let token;
let usuarioId;
let clienteId;
let contratoId;
let archivoId;
let empresaCreadaId;
let datosCliente;
let clienteCreado;

const conToken = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  token = await iniciarSesion("admin", "admin");
  usuarioId = jwt.decode(token).usuarioId;

  datosCliente = clienteDePrueba(`Cliente R06 ${SUFIJO}`);
  clienteCreado = await request(app).post("/clientes").set(conToken()).send(datosCliente);
  clienteId = clienteCreado.body.id;
  ({ contratoId, archivoId } = await crearContratoConPdf(token, {
    clienteId,
    titulo: `Contrato R06 ${SUFIJO}`,
    pdf: PDF_DE_PRUEBA,
    nombreArchivo: "r06.pdf",
  }));
});

afterAll(async () => {
  await borrarContrato(contratoId);
  if (clienteId) await pool.query("DELETE FROM clientes WHERE id = $1", [clienteId]);
  if (empresaCreadaId) await pool.query("DELETE FROM empresas WHERE id = $1", [empresaCreadaId]);
  await pool.end();
});

describe("R-06 Las consultas responden con una sesión válida", () => {
  test.each([
    "/auditoria",
    "/clientes",
    "/clientes/search?name=R06",
    "/contratos",
    "/contratos/estados",
    "/contratos/dashboard",
    "/empresa-usuarios",
    "/metricas",
    "/usuarios",
  ])("GET %s -> 200", async (ruta) => {
    const res = await request(app).get(ruta).set(conToken());
    expect(res.status).toBe(200);
  });

  test("GET /usuarios/:id del propio usuario -> 200", async () => {
    const res = await request(app).get(`/usuarios/${usuarioId}`).set(conToken());
    expect(res.status).toBe(200);
    expect(res.body.nombre_usuario).toBe("admin");
  });

  test("GET /clientes/:id de un cliente propio -> 200", async () => {
    const res = await request(app).get(`/clientes/${clienteId}`).set(conToken());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(clienteId);
  });
});

describe("R-06 Las modificaciones responden con una sesión válida", () => {
  // Crear y actualizar un cliente leen los 25 campos con la misma función:
  // cada dato debe quedar guardado en su propia columna
  test("POST /clientes -> 201 y guarda cada dato en su columna", () => {
    expect(clienteCreado.status).toBe(201);
    expect(clienteCreado.body).toMatchObject(datosCliente);
    expect(clienteCreado.body.es_empresa).toBe(false);
  });

  test("PUT /clientes/:id -> 200 y guarda cada dato en su columna", async () => {
    const editado = { ...clienteDePrueba(`Cliente R06 editado ${SUFIJO}`), es_empresa: true };
    const res = await request(app).put(`/clientes/${clienteId}`).set(conToken()).send(editado);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(editado);
  });

  test("PUT /contratos/:id -> 200", async () => {
    const res = await request(app)
      .put(`/contratos/${contratoId}`)
      .set(conToken())
      .field("cliente_id", String(clienteId))
      .field("titulo", `Contrato R06 editado ${SUFIJO}`)
      .field("fecha_inicio", "2026-01-01")
      .field("fecha_fin", "2026-12-31");
    expect(res.status).toBe(200);
    expect(res.body.titulo).toBe(`Contrato R06 editado ${SUFIJO}`);
  });

  test("Compartir, consultar y desactivar el enlace del contrato -> 200", async () => {
    const compartir = await request(app)
      .post(`/contratos/${contratoId}/share`)
      .set(conToken())
      .send({ password: "clave-r06" });
    expect(compartir.status).toBe(200);

    const consulta = await request(app).get(`/contratos/${contratoId}/share`).set(conToken());
    expect(consulta.status).toBe(200);

    const desactivar = await request(app).delete(`/contratos/${contratoId}/share`).set(conToken());
    expect(desactivar.status).toBe(200);
  });

  test("DELETE /contratos/:id/file/:fileId -> 200", async () => {
    const res = await request(app).delete(`/contratos/${contratoId}/file/${archivoId}`).set(conToken());
    expect(res.status).toBe(200);
  });

  test("POST /empresas de un administrador (sin registro público) -> 201", async () => {
    const res = await request(app)
      .post("/empresas")
      .set(conToken())
      .send({ nombre: `Empresa R06 ${SUFIJO}`, correo: `empresa-r06-${SUFIJO}@prueba.cl` });
    expect(res.status).toBe(201);
    empresaCreadaId = res.body.id;
  });
});
