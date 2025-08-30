FROM node:20-alpine3.21
WORKDIR /usr/src/app
COPY package*.json ./
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
