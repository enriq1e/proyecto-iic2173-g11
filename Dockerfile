# Imagen Base
FROM node:20-alpine

# Workdir indica el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copy copia las dependencias de la app al contenedor
COPY package*.json ./

# Instala dependencias sin cachear builds anteriores
RUN npm ci --omit=dev

# Copy .. copia todos los archivos de nuestra app al contenedor. Excepto los que están en .dockerignore
COPY . .

# Exponemos el puerto 3001 para que la app sea accesible desde fuera del contenedor
EXPOSE 3001

# Definimos la variable de entorno NODE_ENV como production
ENV NODE_ENV production

# CMD es parecido a RUN, pero se ejecuta cuando levantamos el contenedor.
CMD ["node", "src/api/index.js"]
