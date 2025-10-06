# Imagen base
FROM node:20-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiamos dependencias
COPY package*.json ./

# Instalamos dependencias
RUN npm install

# Copiamos el resto del código
COPY . .

# Exponemos el puerto 4000 (porque tu auth-service usa ese puerto)
EXPOSE 4000

# Definimos entorno por defecto
ENV NODE_ENV development

# Comando por defecto al levantar el contenedor
CMD ["node", "src/app.js"]
