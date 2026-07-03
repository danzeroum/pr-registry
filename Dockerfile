FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# node:sqlite é experimental nesta versão do Node — o warning no stderr é
# esperado. O volume de dados é montado em /data (ver docker-compose.yml).
ENV DASHBOARD_DB_PATH=/data/pr-registry.sqlite
ENV DASHBOARD_HOST=0.0.0.0
ENV DASHBOARD_PORT=3000

EXPOSE 3000

CMD ["node", "dashboard/server.js"]
