const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const rateLimit = require("express-rate-limit");

const { pool } = require("./db");
const { opcionesLimiteGeneral } = require("./middleware/limites");
const { manejarErrores } = require("./middleware/errores");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const clientRoutes = require("./routes/clients");
const contractRoutes = require("./routes/contracts");
const publicContractRoutes = require("./routes/public-contracts");
const auditRoutes = require("./routes/audit");
const empresasRoutes = require("./routes/empresas");
const rolesRoutes = require("./routes/roles");
const empresaUsuariosRoutes = require("./routes/empresa_usuarios");
const metricasRoutes = require("./routes/metricas");

const app = express();

// Origen del sitio web de Atlas (lo entrega docker-compose)
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3351";

// Encabezados de seguridad (hallazgos de OWASP ZAP y SonarQube S5689).
// La vista previa de PDF del frontend muestra archivos de la API en un iframe,
// por eso X-Frame-Options se reemplaza por CSP frame-ancestors, que permite
// enmarcar la API solo desde el propio sitio de Atlas (anti-clickjacking).
app.use(
  helmet({
    xFrameOptions: false,
    contentSecurityPolicy: {
      directives: { frameAncestors: ["'self'", FRONTEND_URL] },
    },
  })
);

// CORS restringido al sitio web de Atlas (antes aceptaba cualquier origen, S5122)
app.use(cors({ origin: FRONTEND_URL }));
// Límite de peticiones por IP para toda la API (CodeQL js/missing-rate-limiting).
// Va antes de las rutas para que las proteja a todas.
app.use(rateLimit(opcionesLimiteGeneral()));
app.use(express.json());
app.use(morgan("dev"));

const uploadsDir = path.join(__dirname, "..", "uploads", "contracts");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use("/autenticacion", authRoutes);
app.use("/usuarios", userRoutes);
app.use("/clientes", clientRoutes);
app.use("/contratos", contractRoutes);
app.use("/public/contratos", publicContractRoutes);
app.use("/auditoria", auditRoutes);
app.use("/empresas", empresasRoutes);
app.use("/roles", rolesRoutes);
app.use("/empresa-usuarios", empresaUsuariosRoutes);
app.use("/metricas", metricasRoutes);

const openapi = require("./openapi.json");
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.get("/openapi.json", (req, res) => {
  res.json(openapi);
});

app.use("/files/contracts", express.static(uploadsDir));

app.get("/", (req, res) => {
  res.json({ name: "Atlas", status: "ok" });
});

// DEF-004 y R-04: los errores sin responder se contestan en JSON y sin detalles
// internos (va al final, después de todas las rutas)
app.use(manejarErrores);

const PORT = process.env.PORT || 3000;

// Solo encendemos el servidor si este archivo se ejecuta directamente
// (node src/app.js). Cuando lo usan las pruebas, no se enciende.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Atlas API escuchando en puerto ${PORT}`);
  });
}

module.exports = app;
