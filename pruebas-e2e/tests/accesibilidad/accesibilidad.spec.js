// PRUEBA DE ACCESIBILIDAD (NFR-USAB-1): revisa las páginas con las reglas WCAG 2.1 A y AA.
// Desde la reincorporación de las correcciones la prueba bloquea los problemas
// críticos y también los serios (antes solo los críticos, por eso el contraste
// del botón «Entrar», OBS-01, quedaba solo como observación), y ya no revisa
// solo /login: también las páginas con sesión iniciada (DEF-009 y DEF-010).
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { iniciarSesion } = require("../apoyo");

const paginasPublicas = ["/login", "/registro"];
const paginasConSesion = ["/home", "/clientes", "/clientes/nuevo", "/contratos", "/usuarios", "/auditoria"];

async function revisar(page, ruta) {
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  // Se muestra en consola todo lo encontrado, para el informe
  for (const v of resultado.violations) {
    console.log(`${ruta} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elementos)`);
  }
  return resultado.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${ruta}: ${v.id} (${v.nodes.length})`);
}

for (const ruta of paginasPublicas) {
  test(`La página ${ruta} no tiene problemas críticos ni serios de accesibilidad`, async ({ page }) => {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    expect(await revisar(page, ruta)).toEqual([]);
  });
}

test("Las páginas con sesión iniciada no tienen problemas críticos ni serios de accesibilidad", async ({ page }) => {
  test.setTimeout(90000);
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);

  const problemas = [];
  for (const ruta of paginasConSesion) {
    if (ruta !== "/home") await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    problemas.push(...(await revisar(page, ruta)));
  }
  expect(problemas).toEqual([]);
});
