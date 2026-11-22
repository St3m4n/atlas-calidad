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

const PDF_DE_PRUEBA = Buffer.from("%PDF-1.4\n% documento de prueba DEF-04\n");
const CARPETA_UPLOADS = path.join(__dirname, "..", "..", "uploads", "contracts");
const ARCHIVO_SUELTO = path.join(CARPETA_UPLOADS, "prueba-def04.pdf");

let tokenAdmin;
let tokenOtraEmpresa;
let otra = null;
let contratoId;
let archivoId;

const conToken = (token) => ({ Authorization: `Bearer ${token}` });

async function iniciarSesion(usuario, clave) {
  const res = await request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: usuario, password: clave });
  return res.body.token;
}

beforeAll(async () => {
  tokenAdmin = await iniciarSesion("admin", "admin");

  const creado = await request(app)
    .post("/contratos")
    .set(conToken(tokenAdmin))
    .field("cliente_id", "1")
    .field("titulo", `Contrato DEF-04 ${Date.now()}`)
    .field("fecha_inicio", "2026-01-01")
    .field("fecha_fin", "2026-12-31")
    .attach("files", PDF_DE_PRUEBA, { filename: "def04.pdf", contentType: "application/pdf" });
  contratoId = creado.body.id;
  const docs = await pool.query("SELECT id FROM documentos_contrato WHERE contract_id = $1", [contratoId]);
  archivoId = docs.rows[0].id;

  // Segunda empresa con su propio administrador, creada con el registro público
  const sufijo = Date.now();
  const registro = await request(app)
    .post("/empresas")
    .send({
      usuario: {
        nombre_usuario: `admind04${sufijo}`,
        contrasena_hash: "ClaveEmpresaD04",
        correo: `admind04${sufijo}@prueba.cl`,
      },
      empresa: { nombre: `Empresa D04 ${sufijo}`, correo: `empresad04${sufijo}@prueba.cl` },
    });
  otra = { usuarioId: registro.body.usuario.id, empresaId: registro.body.empresa.id };
  tokenOtraEmpresa = await iniciarSesion(`admind04${sufijo}`, "ClaveEmpresaD04");
});

afterAll(async () => {
  if (fs.existsSync(ARCHIVO_SUELTO)) fs.unlinkSync(ARCHIVO_SUELTO);
  if (contratoId) {
    await pool.query("DELETE FROM documentos_contrato WHERE contract_id = $1", [contratoId]);
    await pool.query("DELETE FROM contratos WHERE id = $1", [contratoId]);
  }
  if (otra) {
    await pool.query("DELETE FROM empresa_usuarios WHERE empresa_id = $1", [otra.empresaId]);
    await pool.query("DELETE FROM usuarios WHERE id = $1", [otra.usuarioId]);
    await pool.query("DELETE FROM empresas WHERE id = $1", [otra.empresaId]);
  }
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
