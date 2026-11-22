// PRUEBAS DE ACEPTACIÓN: cada prueba corresponde a un criterio de aceptación
// escrito en la ERS de Atlas. Formato: Dado / Cuando / Entonces.
const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

test("CA-RF1: un login exitoso abre la sesión y muestra el panel", async ({ page }) => {
  // Dado un usuario registrado (admin)
  // Cuando ingresa sus credenciales correctas
  await iniciarSesion(page, "admin", "admin");
  // Entonces entra al panel principal y ve su nombre
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText("Bienvenido")).toBeVisible();
});

// OBS-04: antes se omitía en celular y tablet porque «Cerrar sesión» quedaba oculto en
// el menú lateral; ahora esas pantallas lo muestran en la barra superior
test("CA-RF1: el cierre de sesión invalida el acceso", async ({ page }) => {
  // Dado un usuario con sesión iniciada
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);
  // Cuando cierra la sesión
  const cerrarSesion = page.getByRole("button", { name: "Cerrar sesión" });
  // Debe verse sin desplazarse ni abrir menús (OBS-04)
  await expect(cerrarSesion).toBeInViewport();
  await cerrarSesion.click();
  // Entonces vuelve al login y ya no puede entrar a páginas protegidas
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
});

// OBS-04 (prueba de uso): en celular el menú lateral fijo ocupaba dos tercios de la
// pantalla; el contenido quedaba en una franja de unos 120 px y una de las personas
// no encontró «Cerrar sesión». Ahora el menú se abre con un botón y la barra superior
// muestra «Cerrar sesión»
test.describe("OBS-04 en un celular pequeño (360 x 640)", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("NFR-COMPAT-2: el contenido usa todo el ancho y «Cerrar sesión» está a la vista", async ({ page }) => {
    await iniciarSesion(page, "admin", "admin");
    await expect(page).toHaveURL(/\/home/);
    const anchoContenido = await page.locator("main").evaluate((e) => e.getBoundingClientRect().width);
    expect(anchoContenido).toBeGreaterThanOrEqual(340);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeInViewport();

    // El menú sigue disponible desde el botón de la barra superior
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/clientes/);
  });
});
