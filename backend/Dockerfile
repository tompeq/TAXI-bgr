FROM node:22.23.1-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM dependencies AS build

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22.23.1-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev --omit=peer \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
