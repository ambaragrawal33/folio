# Development foundation only; no public deployment image is authorized.
FROM node:24.19.0-bookworm-slim
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
ENV HUSKY=0
RUN pnpm install --frozen-lockfile && pnpm --filter @folio/shared build && pnpm tokens:check
EXPOSE 3000 5173
