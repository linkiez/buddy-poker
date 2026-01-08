# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Enable Corepack so Yarn version from packageManager field is used
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY . .
RUN yarn build


FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/buddy-poker/server/server.mjs"]
