-- R-03 / NFR-SEG-2 (Corrección 3 de la segunda entrega)
-- Las contraseñas de las cuentas existentes pasan a hash bcrypt (costo 10).
-- Solo se transforman los valores que todavía no son un hash ($2...),
-- por lo que la migración se puede ejecutar más de una vez sin dañar las cuentas.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE usuarios
SET contrasena_hash = crypt(contrasena_hash, gen_salt('bf', 10))
WHERE contrasena_hash NOT LIKE '$2%';

-- R-08 / DEF-006: las contraseñas de los enlaces de contratos compartidos
-- también pasan a hash bcrypt (con el mismo cuidado de no tocar las que ya lo son).
UPDATE contratos
SET share_password_hash = crypt(share_password_hash, gen_salt('bf', 10))
WHERE share_password_hash IS NOT NULL AND share_password_hash NOT LIKE '$2%';
