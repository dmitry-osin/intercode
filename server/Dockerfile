# ─────────────────────────────────────────────────────────────────────────────
# InterCode — сервер (WebSocket + Yjs + телеметрия + HTTP API).
# Сборка:  docker build -t intercode-server ./server
# Запуск:  docker run -p 8090:8090 -v intercode-data:/app/data intercode-server
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production \
    PORT=8090 \
    DATA_DIR=/app/data

# Сессии, Yjs-документы и журналы телеметрии — сюда монтируется volume.
VOLUME /app/data

EXPOSE 8090
USER node
CMD ["node", "src/index.js"]
