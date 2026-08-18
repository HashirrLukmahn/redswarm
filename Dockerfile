# ArchRed image — runs both the tester (engine + dashboard) and, by default,
# the built-in fintech simulator that stands in for the product under test.
# Swap the `target` service in docker-compose.yml for your real staging image
# to test a faithful replica of cloud.az2.ai (see docs/archred/TARGETING.md).
FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i -D tsx typescript

# App source.
COPY tsconfig.json vitest.config.ts ./
COPY security ./security
COPY sim ./sim
COPY server ./server
COPY cli ./cli

ENV NODE_ENV=production
EXPOSE 4610 4600

# Default: dashboard. Override `command` per service in compose.
CMD ["npx", "tsx", "server/dashboard.ts"]
