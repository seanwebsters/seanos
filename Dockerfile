# Production image for Railway, Fly or any Docker host.
# Mount a persistent volume at DATA_DIR (Railway sets RAILWAY_VOLUME_MOUNT_PATH automatically).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
