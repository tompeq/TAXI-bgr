FROM node:22.23.1-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:1.29.1-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
