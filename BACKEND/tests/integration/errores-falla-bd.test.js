// PRUEBAS DE INTEGRACIÓN - R-04 (si la base de datos falla, no se muestran detalles internos)
// Antes, cada ruta respondía 500 con err.message: si PostgreSQL fallaba, el cliente
// recibía el texto del error, con nombres de tablas, columnas y valores.
// Esta prueba simula una falla de la base de datos en cada ruta y comprueba que la
// respuesta es un 500 con un mensaje genérico, y que el detalle técnico queda solo
// en el registro del servidor (console.error). No usa la base de datos real.
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");
const { firmarToken } = require("../../src/middleware/auth");
const { clienteDePrueba } = require("../apoyo");

// Falla de PostgreSQL que no causan los datos enviados (tabla inexistente)
const FALLA_BD = Object.assign(new Error('relation "contratos" does not exist'), { code: "42P01" });
const GLOSA_GENERICA = "Ocurrió un problema al procesar la solicitud. Intenta nuevamente";

const token = firmarToken({
  usuarioId: 1,
  nombreUsuario: "admin",
  empresaUsuarioId: 1,
  empresaId: 1,
  rolId: 1,
  rolNombre: "administrador",
});

const CLAVE = { password: "clave-r04" };
const USUARIO = { nombre_usuario: "usuario_r04", contrasena_hash: "clave-r04", correo: "usuario-r04@prueba.cl" };
const EMPRESA = { nombre: "Empresa R04", correo: "empresa-r04@prueba.cl" };
const CONTRATO = { cliente_id: 1, titulo: "Contrato R04", fecha_inicio: "2026-01-01", fecha_fin: "2026-12-31" };

// [método, ruta, cuerpo, consultas que responden bien antes de la falla]
// Las rutas de archivos primero comprueban que el contrato es de la empresa (DEF-04)
const RUTAS = [
  ["post", "/autenticacion/login", { nombre_usuario: "admin", password: "admin" }],
  ["get", "/auditoria"],
  ["get", "/clientes"],
  ["get", "/clientes/search?name=R04"],
  ["put", "/clientes/1", clienteDePrueba("Cliente R04")],
  ["post", "/contratos", CONTRATO],
  ["get", "/contratos"],
  ["get", "/contratos/estados"],
  ["get", "/contratos/dashboard"],
  ["put", "/contratos/1", { titulo: "Contrato R04 editado" }],
  ["get", "/contratos/1/files", undefined, 1],
  ["get", "/contratos/1/file/1", undefined, 1],
  ["get", "/contratos/1/file", undefined, 1],
  ["delete", "/contratos/1/file/1"],
  ["delete", "/contratos/1"],
  ["post", "/contratos/1/share", CLAVE],
  ["get", "/contratos/1/share"],
  ["delete", "/contratos/1/share"],
  ["post", "/empresa-usuarios", { usuario_id: 2, rol_id: 2 }],
  ["get", "/empresa-usuarios"],
  ["put", "/empresa-usuarios/1", { empresa_id: 1, usuario_id: 2, rol_id: 2 }],
  ["delete", "/empresa-usuarios/1"],
  ["post", "/empresas", { usuario: USUARIO, empresa: EMPRESA }],
  ["post", "/empresas", EMPRESA],
  ["get", "/empresas"],
  ["get", "/empresas/1"],
  ["put", "/empresas/1", EMPRESA],
  ["delete", "/empresas/1"],
  ["get", "/metricas"],
  ["post", "/public/contratos/token-r04/verify", CLAVE],
  ["post", "/public/contratos/token-r04/files", CLAVE],
  ["post", "/public/contratos/token-r04/file/1", CLAVE],
  ["post", "/roles", { nombre: "Rol R04" }],
  ["get", "/roles"],
  ["put", "/roles/1", { nombre: "Rol R04 editado" }],
  ["delete", "/roles/1"],
  ["post", "/usuarios", USUARIO],
  ["get", "/usuarios"],
  ["put", "/usuarios/1", { correo: "usuario-r04@prueba.cl" }],
  ["delete", "/usuarios/1"],
];

let registroServidor;

beforeEach(() => {
  registroServidor = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

// Todas las filas con 4 valores (Jest pasa su callback "done" si faltan argumentos)
const CASOS = RUTAS.map(([metodo, ruta, cuerpo = null, consultasPrevias = 0]) => [metodo, ruta, cuerpo, consultasPrevias]);

describe("R-04 Si la base de datos falla, la API responde 500 sin detalles internos", () => {
  test.each(CASOS)("%s %s -> 500 con mensaje genérico", async (metodo, ruta, cuerpo, consultasPrevias) => {
    const consulta = jest.spyOn(pool, "query");
    for (let i = 0; i < consultasPrevias; i++) consulta.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    consulta.mockRejectedValue(FALLA_BD);

    const solicitud = request(app)[metodo](ruta).set("Authorization", `Bearer ${token}`);
    const res = await (cuerpo ? solicitud.send(cuerpo) : solicitud);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(res.body.glosa).toBe(GLOSA_GENERICA);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist/);
    // El detalle técnico queda en el registro del servidor
    expect(registroServidor).toHaveBeenCalledWith(FALLA_BD);
  });
});
