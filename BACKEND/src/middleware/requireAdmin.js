// DEF-02: el control de acceso por rol vive en middleware/auth.js, junto con
// requireAuth; este archivo se mantiene para las rutas que ya lo importaban.
module.exports = require("./auth").requireAdmin;
