// PRUEBA DE ACEPTACIÓN: ver los PDF de un contrato con la sesión iniciada (DEF-04)
// Los archivos ya no se abren con un enlace directo a la API (que funcionaba sin
// sesión): el sitio los pide con el token y los muestra desde memoria.
const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

const API_URL = process.env.API_URL || "http://localhost:4451";
const PDF_DE_PRUEBA = Buffer.from("%PDF-1.4\n% documento de prueba DEF-04\n");
const ruta = (contrato, archivo) => new RegExp(`/contratos/${contrato}/file/${archivo}$`);

let tokenAdmin;
let contratoId;
let archivoId;

// Cada perfil (computador, celular, etc.) crea su propio contrato por la API
test.beforeEach(async ({ request }, testInfo) => {
  const login = await request.post(`${API_URL}/autenticacion/login`, {
    data: { nombre_usuario: "admin", password: "admin" },
  });
  tokenAdmin = (await login.json()).token;

  const creado = await request.post(`${API_URL}/contratos`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
    multipart: {
      cliente_id: "1",
      titulo: `Contrato archivos ${testInfo.project.name} ${Date.now()}`,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      files: { name: "contrato-def04.pdf", mimeType: "application/pdf", buffer: PDF_DE_PRUEBA },
    },
  });
  expect(creado.status()).toBe(201);
  contratoId = (await creado.json()).id;

  const archivos = await request.get(`${API_URL}/contratos/${contratoId}/files`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  archivoId = (await archivos.json())[0].id;
});

test.afterEach(async ({ request }) => {
  if (contratoId) {
    await request.delete(`${API_URL}/contratos/${contratoId}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
  }
});

test("CA-DEF04: sin sesión la API no entrega el PDF del contrato", async ({ request }) => {
  const res = await request.get(`${API_URL}/contratos/${contratoId}/file/${archivoId}`);
  expect(res.status()).toBe(401);
});

test("CA-DEF04: desde el detalle, «Ver» abre el PDF pidiéndolo con la sesión", async ({ page, context }) => {
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);
  await page.goto(`/contratos/${contratoId}`);
  await expect(page.getByText("contrato-def04.pdf")).toBeVisible();

  // Algunos navegadores de prueba no traen visor de PDF, por eso se revisa la
  // respuesta y que se abra la pestaña, no lo que muestra la pestaña
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => ruta(contratoId, archivoId).test(new URL(r.url()).pathname)),
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Ver", exact: true }).click(),
  ]);
  const encabezados = await respuesta.request().allHeaders();
  expect(encabezados.authorization).toMatch(/^Bearer /);
  expect(respuesta.status()).toBe(200);
  expect((await respuesta.body()).equals(PDF_DE_PRUEBA)).toBe(true);
});

test("CA-DEF04: al editar, la vista previa muestra el PDF desde memoria", async ({ page }) => {
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);
  await page.goto(`/contratos/${contratoId}/editar`);
  await expect(page.getByText("contrato-def04.pdf")).toBeVisible();

  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => ruta(contratoId, archivoId).test(new URL(r.url()).pathname)),
    page.getByTitle("Previsualizar").first().click(),
  ]);
  expect((await respuesta.request().allHeaders()).authorization).toMatch(/^Bearer /);
  expect(respuesta.status()).toBe(200);
  // El iframe ya no apunta a la API (que exige el token), sino a una URL temporal
  await expect(page.locator('iframe[title="Vista previa del PDF"]')).toHaveAttribute("src", /^blob:/);
});
