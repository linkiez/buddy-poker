# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Enable Corepack so Yarn version from packageManager field is used
RUN corepack enable

COPY package.json yarn.lock ./
RUN yarn install --immutable

COPY . .
RUN yarn build


FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN corepack enable

COPY package.json yarn.lock ./
RUN yarn install --immutable --production

COPY --from=build /app/dist ./dist

EXPOSE 4000

CMD ["yarn", "serve:ssr:buddy-poker"]
