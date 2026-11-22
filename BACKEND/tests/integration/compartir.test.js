// PRUEBAS DE INTEGRACIÓN - R-08 / DEF-006 (contrato compartido con contraseña)
// La contraseña del enlace compartido debe guardarse con hash bcrypt y viajar en
// el cuerpo de la petición, nunca en la URL (las URL quedan en registros del
// servidor, en el historial del navegador y en proxies).
// El límite de intentos fallidos se baja a 5 solo para esta prueba.
process.env.LIMITE_ENLACE_FALLIDOS = "5";

const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

const HASH_BCRYPT = /^\$2[aby]\$10\$/;
const CLAVE_ENLACE = "clave-del-enlace-1";
const PDF_DE_PRUEBA = Buffer.from("%PDF-1.4\n% documento de prueba R-08\n");

let tokenAdmin;
let contratoId;
let estadoOriginal;
let documentoId;
let shareToken;

beforeAll(async () => {
  const login = await request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: "admin", password: "admin" });
  tokenAdmin = login.body.token;

  // Un contrato de la empresa del administrador; se guarda su estado para restaurarlo
  const { rows } = await pool.query(
    `SELECT c.id, c.share_token, c.share_password_hash, c.share_enabled
     FROM contratos c INNER JOIN clientes cl ON cl.id = c.cliente_id
     WHERE cl.empresa_id = $1 ORDER BY c.id LIMIT 1`,
    [login.body.empresaId || 1]
  );
  estadoOriginal = rows[0];
  contratoId = estadoOriginal.id;

  const doc = await pool.query(
    "INSERT INTO documentos_contrato (contract_id, document, nombre_archivo) VALUES ($1, $2, $3) RETURNING id",
    [contratoId, PDF_DE_PRUEBA, "prueba-r08.pdf"]
  );
  documentoId = doc.rows[0].id;
});

afterAll(async () => {
  await pool.query("DELETE FROM documentos_contrato WHERE id = $1", [documentoId]);
  await pool.query(
    "UPDATE contratos SET share_token = $1, share_password_hash = $2, share_enabled = $3 WHERE id = $4",
    [
      estadoOriginal.share_token,
      estadoOriginal.share_password_hash,
      estadoOriginal.share_enabled,
      contratoId,
    ]
  );
  await pool.end();
});

function publica(metodo, ruta) {
  return request(app)[metodo](`/public/contratos/${shareToken}${ruta}`);
}

describe("R-08 / DEF-006 Contrato compartido con contraseña", () => {
  test("Al compartir, la contraseña del enlace se guarda con hash bcrypt", async () => {
    const res = await request(app)
      .post(`/contratos/${contratoId}/share`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ password: CLAVE_ENLACE });
    expect(res.status).toBe(200);
    shareToken = res.body.shareToken;

    const { rows } = await pool.query(
      "SELECT share_password_hash FROM contratos WHERE id = $1",
      [contratoId]
    );
    expect(rows[0].share_password_hash).not.toBe(CLAVE_ENLACE);
    expect(rows[0].share_password_hash).toMatch(HASH_BCRYPT);
  });

  test("Con la contraseña correcta se ve el contrato; con otra, 401", async () => {
    const correcta = await publica("post", "/verify").send({ password: CLAVE_ENLACE });
    expect(correcta.status).toBe(200);
    expect(correcta.body.verified).toBe(true);

    const incorrecta = await publica("post", "/verify").send({ password: "otra-clave" });
    expect(incorrecta.status).toBe(401);
  });

  test("La lista de archivos se pide con la contraseña en el cuerpo (POST)", async () => {
    const res = await publica("post", "/files").send({ password: CLAVE_ENLACE });
    expect(res.status).toBe(200);
    expect(res.body.map((d) => Number(d.id))).toContain(Number(documentoId));
  });

  test("El archivo se descarga con la contraseña en el cuerpo (POST)", async () => {
    const res = await publica("post", `/file/${documentoId}`)
      .send({ password: CLAVE_ENLACE })
      .buffer(true)
      .parse((r, listo) => {
        const partes = [];
        r.on("data", (c) => partes.push(c));
        r.on("end", () => listo(null, Buffer.concat(partes)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.body.equals(PDF_DE_PRUEBA)).toBe(true);
  });

  test("La contraseña ya no se acepta en la URL (?password=)", async () => {
    const lista = await publica("get", `/files?password=${CLAVE_ENLACE}`);
    expect(lista.status).toBe(404);
    const archivo = await publica("get", `/file/${documentoId}?password=${CLAVE_ENLACE}`);
    expect(archivo.status).toBe(404);
  });

  test("Con la contraseña equivocada no se entregan archivos -> 401", async () => {
    const res = await publica("post", "/files").send({ password: "otra-clave" });
    expect(res.status).toBe(401);
  });

  test("Tras varios intentos fallidos el enlace se bloquea con 429 (fuerza bruta)", async () => {
    let ultimo;
    for (let i = 0; i < 10; i++) {
      ultimo = await publica("post", "/verify").send({ password: `intento-${i}` });
      if (ultimo.status === 429) break;
    }
    expect(ultimo.status).toBe(429);
    expect(ultimo.body.error).toBe("Demasiados intentos");
  });
});
