FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/server ./src/server

EXPOSE 10000
CMD ["node", "src/server/index.js"]
