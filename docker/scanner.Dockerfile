FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY scripts/scan-documents.ts ./scripts/scan-documents.ts
COPY scripts/scan-worker-loop.ts ./scripts/scan-worker-loop.ts
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/scan-worker-loop.ts"]
