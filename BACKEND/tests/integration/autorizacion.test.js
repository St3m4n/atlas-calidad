// PRUEBAS DE INTEGRACIÓN - Matriz de autorización por ruta (sesión × rol × empresa)
// Reincorpora DEF-001, DEF-002 y DEF-003 de la segunda entrega y cubre DEF-05,
// encontrado al revisar todas las rutas de la API con esta matriz.
// Las solicitudes sin permiso usan cuerpos vacíos o con los mismos datos que ya
// existen, para que el código sin corregir no pueda alterar los datos de ejemplo.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

let tokenAdmin;
let tokenEditor;
let tokenOtraEmpresa;
let otra = null; // administrador y empresa creados para la prueba

async function iniciarSesion(usuario, clave) {
  const res = await request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: usuario, password: clave });
  return res.body.token;
}

const conToken = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tokenAdmin = await iniciarSesion("admin", "admin");
  tokenEditor = await iniciarSesion("editor", "editor");

  // Segunda empresa con su propio administrador, creada con el registro público
  const sufijo = Date.now();
  const registro = await request(app)
    .post("/empresas")
    .send({
      usuario: {
        nombre_usuario: `adminb${sufijo}`,
        contrasena_hash: "ClaveEmpresaB1",
        correo: `adminb${sufijo}@prueba.cl`,
      },
      empresa: { nombre: `Empresa B ${sufijo}`, correo: `empresab${sufijo}@prueba.cl` },
    });
  otra = { usuarioId: registro.body.usuario.id, empresaId: registro.body.empresa.id };
  tokenOtraEmpresa = await iniciarSesion(`adminb${sufijo}`, "ClaveEmpresaB1");
});

afterAll(async () => {
  if (otra) {
    await pool.query("DELETE FROM empresa_usuarios WHERE empresa_id = $1", [otra.empresaId]);
    await pool.query("DELETE FROM usuarios WHERE id = $1", [otra.usuarioId]);
    await pool.query("DELETE FROM empresas WHERE id = $1", [otra.empresaId]);
  }
  await pool.end();
});

describe("NFR-SEG-4 Las rutas de la API exigen iniciar sesión", () => {
  test.each([
    ["post", "/usuarios", "DEF-001"],
    ["post", "/auditoria", "DEF-002"],
    ["get", "/contratos/1", "DEF-003"],
    ["post", "/contratos", "DEF-05"],
    ["post", "/empresas", "DEF-05 (crear empresa sin registro)"],
    ["get", "/empresas", "DEF-05"],
    ["get", "/empresas/1", "DEF-05"],
    ["put", "/empresas/1", "DEF-05"],
    ["get", "/empresa-usuarios/1", "DEF-05"],
    ["put", "/empresa-usuarios/1", "DEF-05"],
    ["get", "/roles", "DEF-05"],
  ])("%s %s sin token -> 401 (%s)", async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta).send({});
    expect(res.status).toBe(401);
  });
});

describe("RB-5 Solo un administrador gestiona usuarios y la empresa", () => {
  test.each([
    ["post", "/usuarios", "DEF-001"],
    ["post", "/empresas", "DEF-05"],
    ["put", "/empresas/1", "DEF-05"],
    ["post", "/empresa-usuarios", "DEF-05"],
    ["put", "/empresa-usuarios/1", "DEF-05"],
    ["put", "/usuarios/1", "DEF-05 (editar a otro usuario)"],
  ])("%s %s con token de editor -> 403 (%s)", async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta).set(conToken(tokenEditor)).send({});
    expect(res.status).toBe(403);
  });
});

describe("RB-2 Un usuario no accede a datos de otra empresa", () => {
  test("DEF-003: GET /contratos/1 con token de otra empresa -> 404", async () => {
    const res = await request(app).get("/contratos/1").set(conToken(tokenOtraEmpresa));
    expect(res.status).toBe(404);
  });

  test("DEF-05: GET /empresas solo devuelve la empresa propia", async () => {
    const res = await request(app).get("/empresas").set(conToken(tokenOtraEmpresa));
    expect(res.status).toBe(200);
    expect(res.body.map((e) => Number(e.id))).toEqual([Number(otra.empresaId)]);
  });

  test("DEF-05: GET /empresas/1 con token de otra empresa -> 404", async () => {
    const res = await request(app).get("/empresas/1").set(conToken(tokenOtraEmpresa));
    expect(res.status).toBe(404);
  });

  test("DEF-05: PUT /empresas/1 con token de otra empresa -> 404", async () => {
    const actual = await request(app).get("/empresas/1").set(conToken(tokenAdmin));
    const { nombre, direccion, telefono, correo } = actual.body;
    const res = await request(app)
      .put("/empresas/1")
      .set(conToken(tokenOtraEmpresa))
      .send({ nombre, direccion, telefono, correo });
    expect(res.status).toBe(404);
  });

  test("DEF-05: GET /empresa-usuarios/1 con token de otra empresa -> 404", async () => {
    const res = await request(app).get("/empresa-usuarios/1").set(conToken(tokenOtraEmpresa));
    expect(res.status).toBe(404);
  });

  test("DEF-05: PUT /empresa-usuarios/1 con token de otra empresa -> 404", async () => {
    const res = await request(app)
      .put("/empresa-usuarios/1")
      .set(conToken(tokenOtraEmpresa))
      .send({ empresa_id: 1, usuario_id: 1, rol_id: 1 });
    expect(res.status).toBe(404);
  });

  test("DEF-05: PUT /usuarios/1 (usuario de otra empresa) -> 404", async () => {
    const res = await request(app)
      .put("/usuarios/1")
      .set(conToken(tokenOtraEmpresa))
      .send({ correo: "admin@atlasfake.com" });
    expect(res.status).toBe(404);
  });

  test("DEF-05: POST /contratos con un cliente de otra empresa -> 404", async () => {
    const res = await request(app)
      .post("/contratos")
      .set(conToken(tokenOtraEmpresa))
      .send({ cliente_id: 1, titulo: "Prueba de aislamiento", fecha_inicio: "2026-01-01", fecha_fin: "2026-12-31" });
    if (res.status === 201) {
      await pool.query("DELETE FROM contratos WHERE id = $1", [res.body.id]);
    }
    expect(res.status).toBe(404);
  });
});

describe("RB-5 Los usuarios autorizados conservan el acceso", () => {
  test("El administrador ve el contrato de su empresa -> 200", async () => {
    const res = await request(app).get("/contratos/1").set(conToken(tokenAdmin));
    expect(res.status).toBe(200);
    expect(Number(res.body.id)).toBe(1);
  });

  test("El administrador solo ve su empresa en GET /empresas", async () => {
    const res = await request(app).get("/empresas").set(conToken(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.body.map((e) => Number(e.id))).toEqual([1]);
  });

  test("Un editor puede editar su propia cuenta -> 200", async () => {
    const res = await request(app)
      .put("/usuarios/2")
      .set(conToken(tokenEditor))
      .send({ correo: "editor@atlasfake.com" });
    expect(res.status).toBe(200);
  });

  test("DEF-002: con sesión, la bitácora registra al usuario del token -> 201", async () => {
    const res = await request(app)
      .post("/auditoria")
      .set(conToken(tokenAdmin))
      .send({ accion: "PRUEBA_AUTORIZACION", detalles: "registro desde la prueba" });
    expect(res.status).toBe(201);
    expect(res.body.usuario_id).toBe("admin");
  });

  test("DEF-001: el administrador crea un usuario -> 201", async () => {
    const sufijo = Date.now();
    const res = await request(app)
      .post("/usuarios")
      .set(conToken(tokenAdmin))
      .send({ nombre_usuario: `nuevo${sufijo}`, contrasena_hash: "ClaveNueva789", correo: `nuevo${sufijo}@prueba.cl` });
    if (res.body.id) await pool.query("DELETE FROM usuarios WHERE id = $1", [res.body.id]);
    expect(res.status).toBe(201);
  });
});
