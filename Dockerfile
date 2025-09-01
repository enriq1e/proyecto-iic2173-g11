# Docker file sacado del proyecto de IIC2513 2025-1
# Siempre partimos de una imagen base.
FROM node:18-alpine

# Workdir indica el directorio de trabajo dentro del contenedor.
WORKDIR /usr/src/app

# Copy copia las dependencias de la app al contenedor.
COPY package*.json ./

# Instalamos las dependencias de la app.
RUN npm install

# Copy .. copia todos los archivos de nuestra app al contenedor. Excepto los que están en .dockerignore.
COPY . .

# Exponemos el puerto 3001 para que la app sea accesible desde fuera del contenedor.
EXPOSE 3001

# Definimos la variable de entorno NODE_ENV como development.
ENV NODE_ENV development

# CMD es parecido a RUN, pero se ejecuta cuando levantamos el contenedor.
CMD ["node", "src/api/index.js"]
