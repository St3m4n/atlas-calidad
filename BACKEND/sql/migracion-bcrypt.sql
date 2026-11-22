-- R-03 / NFR-SEG-2 (Corrección 3 de la segunda entrega)
-- Las contraseñas de las cuentas existentes pasan a hash bcrypt (costo 10).
-- Solo se transforman los valores que todavía no son un hash ($2...),
-- por lo que la migración se puede ejecutar más de una vez sin dañar las cuentas.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE usuarios
SET contrasena_hash = crypt(contrasena_hash, gen_salt('bf', 10))
WHERE contrasena_hash NOT LIKE '$2%';
