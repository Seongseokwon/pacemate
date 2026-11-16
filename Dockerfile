FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/training-engine/package.json packages/training-engine/package.json
COPY services/api/package.json services/api/package.json
RUN pnpm install --frozen-lockfile --filter @pacemate/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/api services/api
RUN pnpm --filter @pacemate/shared build && pnpm --filter @pacemate/api build

FROM build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "services/api/dist/main.js"]
