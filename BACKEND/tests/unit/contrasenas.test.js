// PRUEBAS UNITARIAS - R-03 (contraseñas con hash bcrypt)
const { hashContrasena, verificarContrasena } = require("../../src/utils/contrasenas");

describe("R-03 / NFR-SEG-2 Utilidad de contraseñas", () => {
  test("El hash no es la contraseña y usa bcrypt con costo 10", async () => {
    const hash = await hashContrasena("ClaveSegura123");
    expect(hash).not.toBe("ClaveSegura123");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  test("La contraseña correcta se acepta y una incorrecta se rechaza", async () => {
    const hash = await hashContrasena("ClaveSegura123");
    await expect(verificarContrasena("ClaveSegura123", hash)).resolves.toBe(true);
    await expect(verificarContrasena("otra-clave", hash)).resolves.toBe(false);
  });

  test("Una contraseña guardada en texto plano nunca se acepta", async () => {
    await expect(verificarContrasena("admin", "admin")).resolves.toBe(false);
    await expect(verificarContrasena("admin", null)).resolves.toBe(false);
  });
});
