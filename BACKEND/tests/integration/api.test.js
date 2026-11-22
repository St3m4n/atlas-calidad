// PRUEBAS DE INTEGRACIÓN
// Verifican que la API, la validación, la seguridad (JWT) y la base de datos
// PostgreSQL funcionen bien JUNTAS. Requieren la base de datos encendida.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");
const { iniciarSesion, clienteDePrueba } = require("../apoyo");

// Los clientes que crean estas pruebas se borran al final, para no acumular
// "Cliente Prueba" en la base de datos en cada ejecución
const clientesCreados = [];

afterAll(async () => {
  if (clientesCreados.length > 0) {
    await pool.query("DELETE FROM clientes WHERE id = ANY($1::bigint[])", [clientesCreados]);
  }
  await pool.end();
});

describe("RF-1 Autenticación", () => {
  test("Credenciales correctas -> 200 y entrega un token", async () => {
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("Contraseña incorrecta -> 401", async () => {
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "equivocada" });
    expect(res.status).toBe(401);
  });

  test("Datos incompletos -> 400 (lo detiene la validación)", async () => {
    const res = await request(app).post("/autenticacion/login").send({});
    expect(res.status).toBe(400);
  });
});

describe("RF-4 Gestión de clientes", () => {
  test("Sin token no se puede listar -> 401", async () => {
    const res = await request(app).get("/clientes");
    expect(res.status).toBe(401);
  });

  test("Con token de administrador se listan los clientes -> 200", async () => {
    const token = await iniciarSesion("admin", "admin");
    const res = await request(app).get("/clientes").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("Administrador crea un cliente válido -> 201", async () => {
    const token = await iniciarSesion("admin", "admin");
    const res = await request(app)
      .post("/clientes")
      .set("Authorization", `Bearer ${token}`)
      .send(clienteDePrueba());
    expect(res.status).toBe(201);
    clientesCreados.push(res.body.id);
  });
});

describe("RB-4 Un editor solo tiene permisos de lectura", () => {
  test("Un editor NO puede eliminar clientes -> 403", async () => {
    const tokenAdmin = await iniciarSesion("admin", "admin");
    const creado = await request(app)
      .post("/clientes")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(clienteDePrueba());
    clientesCreados.push(creado.body.id);

    const tokenEditor = await iniciarSesion("editor", "editor");
    const res = await request(app)
      .delete(`/clientes/${creado.body.id}`)
      .set("Authorization", `Bearer ${tokenEditor}`);

    expect(res.status).toBe(403);
  });
});
