// PRUEBAS DE INTEGRACIÓN - DEF-004 (solicitudes multipart mal formadas)
// La API debe responder 400 o 413 en JSON y seguir funcionando, en vez de
// responder 500 con la página HTML de error de Express. Ninguna de estas
// solicitudes crea datos: todas se rechazan antes de llegar a la base de datos.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

let token;

beforeAll(async () => {
  const login = await request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: "admin", password: "admin" });
  token = login.body.token;
});

afterAll(async () => {
  await pool.end();
});

function multipartCrudo(cuerpo, tipo = "multipart/form-data; boundary=xyz") {
  return request(app)
    .post("/contratos")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", tipo)
    .send(cuerpo);
}

describe("DEF-004 Solicitudes multipart mal formadas", () => {
  test("Cuerpo cortado a la mitad -> 400 en JSON", async () => {
    const res = await multipartCrudo('--xyz\r\nContent-Disposition: form-data; name="titulo"\r\n\r\nabc');
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error).toBe("Solicitud mal formada");
  });

  test("Multipart sin boundary -> 400 en JSON", async () => {
    const res = await multipartCrudo("hola", "multipart/form-data");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  test("Archivo de más de 10 MB -> 413 en JSON", async () => {
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    const res = await request(app)
      .post("/contratos")
      .set("Authorization", `Bearer ${token}`)
      .field("cliente_id", "1")
      .attach("files", grande, { filename: "grande.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(413);
    expect(res.body.glosa).toMatch(/10 MB/);
  });

  test("Más de 10 archivos -> 400 en JSON", async () => {
    let solicitud = request(app).post("/contratos").set("Authorization", `Bearer ${token}`);
    for (let i = 0; i < 11; i++) {
      solicitud = solicitud.attach("files", Buffer.from("%PDF-1.4"), { filename: `a${i}.pdf`, contentType: "application/pdf" });
    }
    const res = await solicitud;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Archivo no válido");
  });

  test("JSON mal escrito -> 400 en JSON (antes, página HTML)", async () => {
    const res = await request(app)
      .post("/clientes")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send('{"nombre": ');
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  test("Después de todo lo anterior la API sigue respondiendo", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });
});
