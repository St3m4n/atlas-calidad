// PRUEBAS UNITARIAS - Límites de peticiones (CodeQL js/missing-rate-limiting)
// Se prueban las opciones y un servidor mínimo, sin base de datos.
const express = require("express");
const request = require("supertest");
const rateLimit = require("express-rate-limit");
const { opcionesLimiteGeneral, opcionesLimiteLogin } = require("../../src/middleware/limites");

const variables = ["LIMITE_PETICIONES_POR_MINUTO", "LIMITE_LOGIN_FALLIDOS"];
const originales = {};

beforeEach(() => {
  for (const nombre of variables) {
    originales[nombre] = process.env[nombre];
    delete process.env[nombre];
  }
});

afterEach(() => {
  for (const nombre of variables) {
    if (originales[nombre] === undefined) delete process.env[nombre];
    else process.env[nombre] = originales[nombre];
  }
});

test("Valores por defecto: 1000 peticiones por minuto y 20 intentos fallidos cada 15 minutos", () => {
  const general = opcionesLimiteGeneral();
  const login = opcionesLimiteLogin();
  expect(general.limit).toBe(1000);
  expect(general.windowMs).toBe(60 * 1000);
  expect(login.limit).toBe(20);
  expect(login.windowMs).toBe(15 * 60 * 1000);
  expect(login.skipSuccessfulRequests).toBe(true);
});

test("Los límites se pueden cambiar con variables de entorno", () => {
  process.env.LIMITE_PETICIONES_POR_MINUTO = "5000";
  process.env.LIMITE_LOGIN_FALLIDOS = "5";
  expect(opcionesLimiteGeneral().limit).toBe(5000);
  expect(opcionesLimiteLogin().limit).toBe(5);
});

test("Un valor inválido en la variable de entorno usa el valor por defecto", () => {
  process.env.LIMITE_PETICIONES_POR_MINUTO = "mucho";
  process.env.LIMITE_LOGIN_FALLIDOS = "-3";
  expect(opcionesLimiteGeneral().limit).toBe(1000);
  expect(opcionesLimiteLogin().limit).toBe(20);
});

test("El límite de inicio de sesión cuenta por IP y nombre de usuario", () => {
  const { keyGenerator } = opcionesLimiteLogin();
  const clave = keyGenerator({ ip: "10.0.0.7", body: { nombre_usuario: "Admin" } });
  const otraCuenta = keyGenerator({ ip: "10.0.0.7", body: { nombre_usuario: "editor" } });
  expect(clave).toBe("10.0.0.7:admin");
  expect(otraCuenta).not.toBe(clave);
  expect(keyGenerator({ ip: "10.0.0.7", body: {} })).toBe("10.0.0.7:");
});

test("Al superar el límite general la API responde 429 con un mensaje en español", async () => {
  process.env.LIMITE_PETICIONES_POR_MINUTO = "3";
  const app = express();
  app.use(rateLimit(opcionesLimiteGeneral()));
  app.get("/", (req, res) => res.json({ ok: true }));

  for (let i = 0; i < 3; i++) {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  }
  const bloqueada = await request(app).get("/");
  expect(bloqueada.status).toBe(429);
  expect(bloqueada.body.error).toBe("Demasiadas peticiones");
  expect(bloqueada.headers["ratelimit-policy"]).toBeDefined();
});
