// PRUEBAS DE INTEGRACIÓN - DEF-02 (control de acceso en rutas de eliminación)
// Se usan identificadores que no existen (999999): las pruebas verifican
// QUIÉN puede intentar eliminar, sin borrar datos reales.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

const ID_INEXISTENTE = 999999;

const rutasDeEliminacion = [
  "/contratos",
  "/usuarios",
  "/roles",
  "/empresas",
  "/empresa-usuarios",
];

async function iniciarSesion(usuario, clave) {
  const res = await request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: usuario, password: clave });
  return res.body.token;
}

afterAll(async () => {
  await pool.end();
});

describe("NFR-SEG-4 Eliminar exige iniciar sesión", () => {
  test.each(rutasDeEliminacion)("DELETE %s/:id sin token -> 401", async (ruta) => {
    const res = await request(app).delete(`${ruta}/${ID_INEXISTENTE}`);
    expect(res.status).toBe(401);
  });
});

describe("RB-4 Un editor no puede eliminar registros", () => {
  test.each(rutasDeEliminacion)("DELETE %s/:id con token de editor -> 403", async (ruta) => {
    const token = await iniciarSesion("editor", "editor");
    const res = await request(app)
      .delete(`${ruta}/${ID_INEXISTENTE}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("RB-5 El administrador conserva el acceso", () => {
  test("DELETE /contratos/:id inexistente con token de administrador -> 404", async () => {
    const token = await iniciarSesion("admin", "admin");
    const res = await request(app)
      .delete(`/contratos/${ID_INEXISTENTE}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
