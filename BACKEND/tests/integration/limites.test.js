// PRUEBAS DE INTEGRACIÓN - Límites de peticiones en la API real
// (CodeQL js/missing-rate-limiting y protección contra fuerza bruta en el login).
// El límite de intentos fallidos se baja a 3 solo para esta prueba; se fija
// antes de cargar la API porque el limitador se crea al cargar las rutas.
process.env.LIMITE_LOGIN_FALLIDOS = "3";

const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

// Nombre de usuario que no existe: los intentos fallidos no tocan cuentas reales
const usuarioInexistente = `noexiste${Date.now()}`;

function intentarLogin(nombre_usuario, password) {
  return request(app).post("/autenticacion/login").send({ nombre_usuario, password });
}

afterAll(async () => {
  await pool.end();
});

describe("Límite general de peticiones", () => {
  test("Las respuestas de la API informan el límite (encabezados RateLimit)", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-policy"]).toBeDefined();
    expect(res.headers["ratelimit"]).toBeDefined();
  });
});

describe("Límite de intentos fallidos de inicio de sesión", () => {
  test("Tras 3 intentos fallidos el siguiente se bloquea con 429", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await intentarLogin(usuarioInexistente, "clave-equivocada");
      expect(res.status).toBe(401);
    }
    const bloqueado = await intentarLogin(usuarioInexistente, "clave-equivocada");
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toBe("Demasiados intentos");
  });

  test("El bloqueo de una cuenta no impide entrar a otra", async () => {
    const res = await intentarLogin("admin", "admin");
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("Los inicios de sesión correctos no cuentan para el límite", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await intentarLogin("editor", "editor");
      expect(res.status).toBe(200);
    }
  });
});
