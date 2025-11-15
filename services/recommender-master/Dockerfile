# Dockerfile para JobMaster
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci || npm install --production
COPY src ./src
COPY .env.example ./
ENV NODE_ENV=production
ENV PORT=8080
CMD ["node", "src/index.js"]
