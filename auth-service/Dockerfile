# Dockerfile para el servicio de autenticación
FROM node:18-alpine

# Establecer directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto de los archivos
COPY . .

# Exponer el puerto del servicio de autenticación
EXPOSE 4000

# Definir variable de entorno
ENV NODE_ENV development

# Comando para ejecutar el servicio
CMD ["node", "src/app.js"]
