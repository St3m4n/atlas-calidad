// PRUEBAS DE INTEGRACIÓN - DEF-04 (archivos PDF de los contratos)
// Los documentos de un contrato solo se entregan con sesión y a usuarios de la
// empresa dueña del cliente. Antes, cualquiera que conociera el número del
// contrato podía descargarlos sin iniciar sesión.
// La prueba crea su propio contrato con un PDF y una segunda empresa, y borra
// ambos al terminar.
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");
const {
  conToken,
  iniciarSesion,
  registrarOtraEmpresa,
  borrarOtraEmpresa,
  crearContratoConPdf,
  borrarContrato,
} = require("../apoyo");

const PDF_DE_PRUEBA = Buffer.from("%PDF-1.4\n% documento de prueba DEF-04\n");
const CARPETA_UPLOADS = path.join(__dirname, "..", "..", "uploads", "contracts");
const ARCHIVO_SUELTO = path.join(CARPETA_UPLOADS, "prueba-def04.pdf");

let tokenAdmin;
let tokenOtraEmpresa;
let otra = null;
let contratoId;
let archivoId;

beforeAll(async () => {
  tokenAdmin = await iniciarSesion("admin", "admin");
  ({ contratoId, archivoId } = await crearContratoConPdf(tokenAdmin, {
    titulo: `Contrato DEF-04 ${Date.now()}`,
    pdf: PDF_DE_PRUEBA,
    nombreArchivo: "def04.pdf",
  }));
  otra = await registrarOtraEmpresa("admind04");
  tokenOtraEmpresa = otra.token;
});

afterAll(async () => {
  if (fs.existsSync(ARCHIVO_SUELTO)) fs.unlinkSync(ARCHIVO_SUELTO);
  await borrarContrato(contratoId);
  await borrarOtraEmpresa(otra);
  await pool.end();
});

const rutas = () => [
  ["lista de archivos", `/contratos/${contratoId}/files`],
  ["archivo por número", `/contratos/${contratoId}/file/${archivoId}`],
  ["último archivo (ruta antigua)", `/contratos/${contratoId}/file`],
];

describe("DEF-04 Los archivos del contrato exigen sesión", () => {
  test("Sin token -> 401 en las tres rutas de archivos", async () => {
    for (const [nombre, ruta] of rutas()) {
      const res = await request(app).get(ruta);
      expect({ nombre, status: res.status }).toEqual({ nombre, status: 401 });
    }
  });

  test("Con token de otra empresa -> 404 en las tres rutas (no revela que existe)", async () => {
    for (const [nombre, ruta] of rutas()) {
      const res = await request(app).get(ruta).set(conToken(tokenOtraEmpresa));
      expect({ nombre, status: res.status }).toEqual({ nombre, status: 404 });
    }
  });

  test("Con token falso -> 401", async () => {
    const res = await request(app)
      .get(`/contratos/${contratoId}/file/${archivoId}`)
      .set(conToken("token.inventado.x"));
    expect(res.status).toBe(401);
  });
});

describe("DEF-04 La empresa dueña sigue viendo sus archivos", () => {
  test("Lista de archivos del contrato", async () => {
    const res = await request(app).get(`/contratos/${contratoId}/files`).set(conToken(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.body.map((d) => d.id)).toContain(archivoId);
  });

  test("Archivo por número: entrega el mismo PDF", async () => {
    const res = await request(app)
      .get(`/contratos/${contratoId}/file/${archivoId}`)
      .set(conToken(tokenAdmin))
      .buffer(true)
      .parse((r, cb) => {
        const partes = [];
        r.on("data", (p) => partes.push(p));
        r.on("end", () => cb(null, Buffer.concat(partes)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.body.equals(PDF_DE_PRUEBA)).toBe(true);
  });

  test("Ruta antigua del último archivo", async () => {
    const res = await request(app).get(`/contratos/${contratoId}/file`).set(conToken(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
  });

  test("Contrato inexistente -> 404", async () => {
    const res = await request(app).get("/contratos/999999999/files").set(conToken(tokenAdmin));
    expect(res.status).toBe(404);
  });

  test("Número de contrato que no es un entero -> 404 en JSON (antes, error 500)", async () => {
    const res = await request(app).get("/contratos/abc/files").set(conToken(tokenAdmin));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No encontrado");
  });
});

describe("DEF-04 La carpeta de subidas ya no se publica", () => {
  test("Un archivo dejado en uploads/contracts no se entrega sin sesión", async () => {
    fs.mkdirSync(CARPETA_UPLOADS, { recursive: true });
    fs.writeFileSync(ARCHIVO_SUELTO, PDF_DE_PRUEBA);
    const res = await request(app).get("/files/contracts/prueba-def04.pdf");
    expect(res.status).toBe(404);
    // y la ruta inexistente responde en JSON, sin la página HTML de Express
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error).toBe("No encontrado");
  });
});
