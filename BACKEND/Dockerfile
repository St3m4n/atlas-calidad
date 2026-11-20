# Imagen base con soporte vigente (Node 18 ya no recibe actualizaciones)
FROM node:20-alpine

WORKDIR /app

# Primero solo los archivos de dependencias (aprovecha la caché de Docker)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Luego el código de la aplicación
COPY src/ ./src/
COPY sql/ ./sql/

# Carpeta de documentos con permisos para el usuario sin privilegios
RUN mkdir -p uploads/contracts && chown -R node:node /app/uploads

# No ejecutar como administrador (root)
USER node

# El puerto real en que escucha la API
EXPOSE 4000

CMD ["node", "src/app.js"]
