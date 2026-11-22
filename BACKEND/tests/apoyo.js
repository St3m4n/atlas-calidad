// Funciones de apoyo que comparten las pruebas de integración. Reúnen la
// preparación que antes se repetía en cada archivo (iniciar sesión, crear una
// segunda empresa, crear un contrato con PDF, datos de un cliente) y su limpieza.
const request = require("supertest");
const app = require("../src/app");
const { pool } = require("../src/db");

const conToken = (token) => ({ Authorization: `Bearer ${token}` });

async function iniciarSesion(usuario, clave) {
  const res = await request(app)
    .post("/autenticacion/login")
    .send({ nombre_usuario: usuario, password: clave });
  return res.body.token;
}

// Segunda empresa con su propio administrador, creada con el registro público.
// Devuelve { usuarioId, empresaId, token } para probar el aislamiento entre empresas.
async function registrarOtraEmpresa(prefijo) {
  const usuario = `${prefijo}${Date.now()}`;
  const clave = "ClaveEmpresaB1";
  const registro = await request(app)
    .post("/empresas")
    .send({
      usuario: { nombre_usuario: usuario, contrasena_hash: clave, correo: `${usuario}@prueba.cl` },
      empresa: { nombre: `Empresa ${usuario}`, correo: `empresa-${usuario}@prueba.cl` },
    });
  return {
    usuarioId: registro.body.usuario.id,
    empresaId: registro.body.empresa.id,
    token: await iniciarSesion(usuario, clave),
  };
}

async function borrarOtraEmpresa(otra) {
  if (!otra) return;
  await pool.query("DELETE FROM empresa_usuarios WHERE empresa_id = $1", [otra.empresaId]);
  await pool.query("DELETE FROM usuarios WHERE id = $1", [otra.usuarioId]);
  await pool.query("DELETE FROM empresas WHERE id = $1", [otra.empresaId]);
}

// Contrato con un PDF, creado por la API. Devuelve { contratoId, archivoId }.
async function crearContratoConPdf(token, { titulo, pdf, nombreArchivo, clienteId = 1 }) {
  const creado = await request(app)
    .post("/contratos")
    .set(conToken(token))
    .field("cliente_id", String(clienteId))
    .field("titulo", titulo)
    .field("fecha_inicio", "2026-01-01")
    .field("fecha_fin", "2026-12-31")
    .attach("files", pdf, { filename: nombreArchivo, contentType: "application/pdf" });
  const contratoId = creado.body.id;
  const docs = await pool.query("SELECT id FROM documentos_contrato WHERE contract_id = $1", [contratoId]);
  return { contratoId, archivoId: docs.rows[0]?.id };
}

async function borrarContrato(contratoId) {
  if (!contratoId) return;
  await pool.query("DELETE FROM documentos_contrato WHERE contract_id = $1", [contratoId]);
  await pool.query("DELETE FROM contratos WHERE id = $1", [contratoId]);
}

// Datos completos y válidos de un cliente (correos distintos en cada llamada)
function clienteDePrueba(nombre = "Cliente Prueba") {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    nombre,
    correo: `cliente${id}@prueba.cl`,
    telefono: "912345678",
    rut: "11111111-1",
    nombre_fantasia: "Prueba SpA",
    giro_actividad_economica: "Servicios",
    nombre_representante: "Ana Pérez",
    cargo_representante: "Gerente",
    correo_representante: `rep${id}@prueba.cl`,
    telefono_representante: "912345678",
    relacion_representante: "Representante legal",
    direccion_calle: "Av. Siempre Viva",
    direccion_numero: "742",
    direccion_ciudad: "Santiago",
    direccion_region: "Metropolitana",
    sitio_web: "https://www.prueba.cl",
    telefono_corporativo: "223456789",
    nombre_banco: "Banco Estado",
    numero_cuenta: "123456",
    titular_cuenta: "Prueba SpA",
    metodo_pago: "transferencia",
    dia_pago: "5",
    moneda: "CLP",
  };
}

module.exports = {
  conToken,
  iniciarSesion,
  registrarOtraEmpresa,
  borrarOtraEmpresa,
  crearContratoConPdf,
  borrarContrato,
  clienteDePrueba,
};
