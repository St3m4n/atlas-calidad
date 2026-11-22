# Etapa 1: Construcción
FROM node:20 AS builder

WORKDIR /app

ARG VITE_API_URL=http://localhost:4000

COPY package*.json ./

# Instala exactamente las versiones del package-lock.json, ya revisadas (npm audit) y
# con al menos dos semanas de publicadas. Antes se borraba el lockfile y npm install
# tomaba en cada construcción la versión más reciente de cada paquete.
# El lockfile incluye los binarios de Linux de rollup y esbuild.
RUN npm ci

# .dockerignore deja fuera node_modules, dist y .env de la carpeta local
COPY . .

ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# Etapa 2: Producción
FROM nginx:1.29-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
