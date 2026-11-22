// Funciones de apoyo que comparten todas las pruebas
const { expect } = require("@playwright/test");

const API_URL = process.env.API_URL || "http://localhost:4451";

async function iniciarSesion(page, usuario, clave) {
  await page.goto("/login");
  await page.getByTestId("input-nombre-usuario").fill(usuario);
  await page.getByTestId("input-password").fill(clave);
  await page.getByTestId("button-login").click();
}

// Contrato con un PDF creado por la API con la sesión del administrador.
// Cada perfil (computador, celular, etc.) crea el suyo, para que las pruebas en
// paralelo no se pisen entre sí. Devuelve { token, contratoId }.
async function crearContratoConPdf(request, { titulo, nombreArchivo, pdf }) {
  const login = await request.post(`${API_URL}/autenticacion/login`, {
    data: { nombre_usuario: "admin", password: "admin" },
  });
  const token = (await login.json()).token;
  const creado = await request.post(`${API_URL}/contratos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      cliente_id: "1",
      titulo,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      files: { name: nombreArchivo, mimeType: "application/pdf", buffer: pdf },
    },
  });
  expect(creado.status()).toBe(201);
  return { token, contratoId: (await creado.json()).id };
}

async function borrarContrato(request, token, contratoId) {
  if (!contratoId) return;
  await request.delete(`${API_URL}/contratos/${contratoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = { API_URL, iniciarSesion, crearContratoConPdf, borrarContrato };
