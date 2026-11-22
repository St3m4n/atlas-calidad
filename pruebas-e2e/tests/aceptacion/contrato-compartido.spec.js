// PRUEBA DE ACEPTACIÓN: compartir un contrato con contraseña (R-08 / DEF-006 y DEF-012)
// El administrador genera el enlace desde la pantalla del contrato y otra persona,
// sin sesión, lo abre con la contraseña. La contraseña nunca debe viajar en una URL.
const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

const API_URL = process.env.API_URL || "http://localhost:4451";
const CLAVE_ENLACE = "clave-del-enlace";
const PDF_DE_PRUEBA = Buffer.from("%PDF-1.4\n% documento de prueba para el enlace compartido\n");

let tokenAdmin;
let contratoId;

// Cada perfil (computador, celular, etc.) crea su propio contrato por la API,
// para que las pruebas en paralelo no se reemplacen el enlace entre sí
test.beforeEach(async ({ request }, testInfo) => {
  const login = await request.post(`${API_URL}/autenticacion/login`, {
    data: { nombre_usuario: "admin", password: "admin" },
  });
  tokenAdmin = (await login.json()).token;

  const creado = await request.post(`${API_URL}/contratos`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
    multipart: {
      cliente_id: "1",
      titulo: `Contrato compartido ${testInfo.project.name} ${Date.now()}`,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      files: { name: "contrato-compartido.pdf", mimeType: "application/pdf", buffer: PDF_DE_PRUEBA },
    },
  });
  expect(creado.status()).toBe(201);
  contratoId = (await creado.json()).id;
});

test.afterEach(async ({ request }) => {
  if (contratoId) {
    await request.delete(`${API_URL}/contratos/${contratoId}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
  }
});

test("CA-R08: el contrato compartido se abre con su contraseña y sin enviarla en la URL", async ({ page, browser }) => {
  // El administrador genera el enlace (antes el diálogo se caía: DEF-012)
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);
  await page.goto(`/contratos/${contratoId}`);
  await page.getByRole("button", { name: "Compartir Contrato" }).click();
  await page.getByLabel("Contraseña para compartir").fill(CLAVE_ENLACE);
  await page.getByRole("button", { name: "Generar Enlace" }).click();
  await expect(page.getByText("Recuerda compartir la contraseña")).toBeVisible();
  const enlace = await page.getByText(/\/contratos\/compartido\//).innerText();

  // Otra persona, sin sesión, abre el enlace en un navegador aparte
  const contexto = await browser.newContext();
  const visitante = await contexto.newPage();
  const urlsPedidas = [];
  contexto.on("request", (r) => urlsPedidas.push(r.url()));

  await visitante.goto(new URL(new URL(enlace).pathname, page.url()).href);
  await visitante.getByLabel("Contraseña").fill("clave-equivocada");
  await visitante.getByRole("button", { name: "Acceder" }).click();
  await expect(visitante.getByText("La contraseña proporcionada no es correcta").first()).toBeVisible();

  await visitante.getByLabel("Contraseña").fill(CLAVE_ENLACE);
  await visitante.getByRole("button", { name: "Acceder" }).click();
  await expect(visitante.getByText("contrato-compartido.pdf")).toBeVisible();

  // El documento se pide con POST y la contraseña va en el cuerpo; se abre en una
  // pestaña nueva. (Algunos navegadores de prueba no traen visor de PDF y lo
  // descargan, por eso se revisa la respuesta y no lo que muestra la pestaña.)
  const [respuestaPdf] = await Promise.all([
    visitante.waitForResponse((r) => /\/file\/\d+$/.test(new URL(r.url()).pathname)),
    contexto.waitForEvent("page"),
    visitante.getByRole("button", { name: "Ver Documento" }).click(),
  ]);
  expect(respuestaPdf.request().method()).toBe("POST");
  expect(respuestaPdf.request().postDataJSON()).toEqual({ password: CLAVE_ENLACE });
  expect(respuestaPdf.status()).toBe(200);
  expect(respuestaPdf.headers()["content-type"]).toMatch(/application\/pdf/);
  expect((await respuestaPdf.body()).equals(PDF_DE_PRUEBA)).toBe(true);

  expect(urlsPedidas.filter((u) => /password=/i.test(u))).toEqual([]);
  await contexto.close();
});
