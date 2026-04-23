FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm ci
RUN npm run build && npm run avatars:export

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV UI_MODE=true
ENV UI_PORT=4310
ENV UI_BIND_ADDRESS=0.0.0.0

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/runtime ./runtime
COPY .env.example ./.env.example
COPY README.md ./README.md
COPY README.zh-CN.md ./README.zh-CN.md
COPY HALL.md ./HALL.md
COPY docs ./docs

EXPOSE 4310

CMD ["node", "dist/index.js"]
