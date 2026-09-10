FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts/scan-documents.ts ./scripts/scan-documents.ts
COPY scripts/scan-worker-loop.ts ./scripts/scan-worker-loop.ts
# The loop invokes the scan-documents batch logic every SCAN_INTERVAL_MS.
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/scan-worker-loop.ts"]
