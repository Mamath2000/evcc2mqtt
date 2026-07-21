# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Build metadata (optional)
ARG GIT_REF=""
ARG BUILD_DATE=""
LABEL org.opencontainers.image.revision=$GIT_REF \
      org.opencontainers.image.created=$BUILD_DATE

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY .env.example ./.env.example
COPY package.json ./package.json

CMD ["node", "src/index.js"]
