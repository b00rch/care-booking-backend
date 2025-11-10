# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /opt/app

# Enable corepack to make yarn available inside the image
RUN corepack enable

# Install dependencies separately to take advantage of Docker layer caching
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --frozen-lockfile

# Build the Strapi admin panel and compile TypeScript
FROM deps AS builder
COPY . .
RUN yarn build

# -- Production image -------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /opt/app
ENV NODE_ENV=production
RUN corepack enable

# Only copy the files we need for runtime
COPY package.json yarn.lock .yarnrc.yml ./
COPY --from=deps /opt/app/node_modules ./node_modules
COPY --from=builder /opt/app .

EXPOSE 1337

CMD ["yarn", "start"]
