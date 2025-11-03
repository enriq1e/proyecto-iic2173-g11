# Dockerfile para Recommender Worker
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci || npm install --production
COPY src ./src
COPY .env.example ./
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
