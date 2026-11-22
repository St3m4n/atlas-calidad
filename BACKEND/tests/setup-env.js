// Datos de conexión que usan las pruebas cuando no se indican otros.
// Apuntan a la base de datos que levanta docker compose (puerto 15433).
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:15433/atlas";
// R-01: la API exige una clave de al menos 32 caracteres; si no se indica una,
// las pruebas usan una aleatoria distinta en cada ejecución
process.env.JWT_SECRET = process.env.JWT_SECRET || require("crypto").randomBytes(32).toString("hex");
