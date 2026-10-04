FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG VITE_ASSET_BASE_URL
ARG VITE_APP_VERSION=dev
ENV VITE_ASSET_BASE_URL=$VITE_ASSET_BASE_URL VITE_APP_VERSION=$VITE_APP_VERSION
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/app/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./package.json
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3001
CMD ["node", "server/index.mjs"]
