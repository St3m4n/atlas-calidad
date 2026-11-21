// Configuración de Playwright para Atlas
const { defineConfig, devices } = require("@playwright/test");

// En el PC de desarrollo (Windows) el Firefox de Playwright no logra iniciar
// (error de ensamblado "mozglue"). Ahí Firefox se ejecuta en el contenedor
// oficial de Playwright (Linux) y en el pipeline de GitHub Actions.
const incluirFirefox = process.platform !== "win32" || process.env.PW_FIREFOX === "1";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3351",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // Perfiles de la guía (Actividad 3)
    { name: "computador", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
    // Compatibilidad con otros navegadores y tablet (NFR-COMPAT-1 y NFR-COMPAT-2),
    // agregados por la retroalimentación de la Entrega 2
    ...(incluirFirefox ? [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }] : []),
    { name: "safari-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],
});
