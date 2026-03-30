FROM node:22-slim

WORKDIR /app

COPY package.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY packages/cli/package.json packages/cli/

RUN npm install

COPY packages/ packages/

RUN npm run build

# CLI entry point - use with: docker run kagura-search "search query"
ENTRYPOINT ["node", "packages/cli/dist/index.js"]
