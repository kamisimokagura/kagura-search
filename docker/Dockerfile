FROM node:22-slim

WORKDIR /app

COPY package.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY packages/cli/package.json packages/cli/

RUN npm install

COPY packages/ packages/

RUN npm run build

EXPOSE 3100

CMD ["node", "packages/mcp/dist/index.js"]
