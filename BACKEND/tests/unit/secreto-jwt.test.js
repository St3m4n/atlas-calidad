// PRUEBAS UNITARIAS - R-01 (clave JWT por defecto) y R-06 (verificación duplicada)
// R-01: si faltaba JWT_SECRET, ocho archivos de rutas firmaban y verificaban los
// tokens con la clave conocida «inseguro», y cualquiera podía fabricar un token de
// administrador. Ahora la API no inicia sin una clave propia y suficientemente larga.
// R-06: cada archivo de rutas tenía su propia copia de getUserFromAuthHeader; ahora
// los tokens se firman y verifican solo en middleware/auth.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const CLAVE_ORIGINAL = process.env.JWT_SECRET;
const CARPETA_RUTAS = path.join(__dirname, "..", "..", "src", "routes");
const SESION_ADMIN = { usuarioId: 1, nombreUsuario: "admin", empresaId: 1, rolNombre: "administrador" };

// Carga la API desde cero con la clave indicada, sin leer el archivo .env.
// Devuelve el error de arranque, o null si la API cargó.
function arrancarApiCon(clave) {
  if (clave === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = clave;
  let error = null;
  jest.isolateModules(() => {
    jest.doMock("dotenv", () => ({ config: () => ({}) }));
    try {
      require("../../src/app");
    } catch (e) {
      error = e;
    }
  });
  return error;
}

const conToken = (token) => ({ headers: { authorization: `Bearer ${token}` } });

afterEach(() => {
  process.env.JWT_SECRET = CLAVE_ORIGINAL;
  jest.dontMock("dotenv");
});

describe("R-01 La API no inicia sin una clave JWT propia", () => {
  test("Sin JWT_SECRET la aplicación no inicia (antes usaba la clave «inseguro»)", () => {
    expect(arrancarApiCon(undefined)?.message).toMatch(/JWT_SECRET/);
  });

  test.each([
    ["inseguro", "la antigua clave de respaldo"],
    ["escribe-aqui-una-clave-larga-y-aleatoria", "el ejemplo de .env.example"],
    ["your-secret-key-change-in-production", "el antiguo valor por defecto de docker-compose"],
    ["clave-corta-de-prueba", "menos de 32 caracteres"],
  ])("Con JWT_SECRET=%s (%s) la aplicación no inicia", (clave) => {
    expect(arrancarApiCon(clave)?.message).toMatch(/JWT_SECRET/);
  });

  test("Con una clave aleatoria de 64 caracteres la aplicación inicia", () => {
    expect(arrancarApiCon(crypto.randomBytes(32).toString("hex"))).toBeNull();
  });
});

describe("R-01 y R-06 Un solo lugar firma y verifica los tokens", () => {
  const { firmarToken, getUserFromAuthHeader } = require("../../src/middleware/auth");

  test("Un token firmado por la API se acepta y dura 2 horas", () => {
    const sesion = getUserFromAuthHeader(conToken(firmarToken(SESION_ADMIN)));
    expect(sesion).toEqual(expect.objectContaining(SESION_ADMIN));
    expect(sesion.exp - sesion.iat).toBe(2 * 60 * 60);
  });

  test("Un token de administrador fabricado con la clave «inseguro» no se acepta", () => {
    const falso = jwt.sign(SESION_ADMIN, "inseguro");
    expect(getUserFromAuthHeader(conToken(falso))).toBeNull();
  });

  test("Un token sin firma (algoritmo none) no se acepta", () => {
    const parte = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const sinFirma = `${parte({ alg: "none", typ: "JWT" })}.${parte(SESION_ADMIN)}.`;
    expect(getUserFromAuthHeader(conToken(sinFirma))).toBeNull();
  });

  test("Ningún archivo de rutas verifica tokens por su cuenta ni tiene una clave de respaldo", () => {
    const hallazgos = fs
      .readdirSync(CARPETA_RUTAS)
      .filter((archivo) => archivo.endsWith(".js"))
      .flatMap((archivo) => {
        const codigo = fs.readFileSync(path.join(CARPETA_RUTAS, archivo), "utf8");
        return ["inseguro", "jwt.verify", "jwt.sign", "function getUserFromAuthHeader", "process.env.JWT_SECRET"]
          .filter((patron) => codigo.includes(patron))
          .map((patron) => `${archivo}: ${patron}`);
      });
    expect(hallazgos).toEqual([]);
  });
});
