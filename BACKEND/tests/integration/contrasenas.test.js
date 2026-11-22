// PRUEBAS DE INTEGRACIÓN - R-03 (Corrección 3 de la segunda entrega, reincorporada)
// Verifican que las contraseñas se guarden con hash bcrypt y que el inicio
// de sesión siga funcionando con las cuentas migradas y con las nuevas.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

const HASH_BCRYPT = /^\$2[aby]\$10\$/;

async function iniciarSesion(usuario, clave) {
  return request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: usuario, password: clave });
}

let usuarioCreado = null;

afterAll(async () => {
  if (usuarioCreado) {
    await pool.query("DELETE FROM empresa_usuarios WHERE usuario_id = $1", [usuarioCreado.id]);
    await pool.query("DELETE FROM usuarios WHERE id = $1", [usuarioCreado.id]);
  }
  await pool.end();
});

describe("R-03 / NFR-SEG-2 Contraseñas con hash bcrypt", () => {
  test("CP-17: ninguna cuenta guarda su contraseña en texto plano", async () => {
    const { rows } = await pool.query("SELECT contrasena_hash FROM usuarios");
    expect(rows.length).toBeGreaterThan(0);
    for (const fila of rows) {
      expect(fila.contrasena_hash).toMatch(HASH_BCRYPT);
    }
  });

  test("Las cuentas migradas siguen iniciando sesión (admin y editor) -> 200", async () => {
    expect((await iniciarSesion("admin", "admin")).status).toBe(200);
    expect((await iniciarSesion("editor", "editor")).status).toBe(200);
  });

  test("Un usuario creado por el administrador queda con hash y puede iniciar sesión", async () => {
    const token = (await iniciarSesion("admin", "admin")).body.token;
    const sufijo = Date.now();
    const datos = {
      nombre_usuario: `prueba${sufijo}`,
      contrasena_hash: "ClaveSegura123",
      correo: `prueba${sufijo}@prueba.cl`,
      rol_id: 2,
    };

    const res = await request(app)
      .post("/empresa-usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send(datos);
    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      "SELECT id, contrasena_hash FROM usuarios WHERE nombre_usuario = $1",
      [datos.nombre_usuario]
    );
    usuarioCreado = rows[0];
    expect(usuarioCreado.contrasena_hash).not.toBe(datos.contrasena_hash);
    expect(usuarioCreado.contrasena_hash).toMatch(HASH_BCRYPT);

    expect((await iniciarSesion(datos.nombre_usuario, "ClaveSegura123")).status).toBe(200);
  });

  test("Al cambiar la contraseña con PUT /usuarios/:id se guarda con hash", async () => {
    expect(usuarioCreado).not.toBeNull();
    const token = (await iniciarSesion("admin", "admin")).body.token;

    const res = await request(app)
      .put(`/usuarios/${usuarioCreado.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ contrasena_hash: "OtraClave456" });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      "SELECT nombre_usuario, contrasena_hash FROM usuarios WHERE id = $1",
      [usuarioCreado.id]
    );
    expect(rows[0].contrasena_hash).toMatch(HASH_BCRYPT);
    expect((await iniciarSesion(rows[0].nombre_usuario, "OtraClave456")).status).toBe(200);
    expect((await iniciarSesion(rows[0].nombre_usuario, "ClaveSegura123")).status).toBe(401);
  });
});
