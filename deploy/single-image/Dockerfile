ARG NODE_IMAGE=m.daocloud.io/docker.io/library/node:24.16.0-bookworm-slim
FROM ${NODE_IMAGE} AS builder

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG BUILD_NODE_OPTIONS=--max-old-space-size=8192
ENV CI=true PNPM_HOME=/pnpm NODE_OPTIONS=${BUILD_NODE_OPTIONS}
ENV PATH=/pnpm:$PATH
WORKDIR /workspace
RUN npm install --global pnpm@11.16.0 --registry=${NPM_REGISTRY}
COPY . .
RUN --mount=type=cache,id=rail-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --registry=${NPM_REGISTRY}
# The browser always calls the same origin; deployment URLs are runtime configuration.
ENV VITE_GLOB_API_URL=/api/v1 VITE_BASE=/ VITE_PWA=false VITE_ARCHIVER=false
RUN pnpm build:rail
RUN pnpm --filter @rail/platform-api --prod deploy --legacy /runtime

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
ENV NODE_ENV=production NITRO_HOST=127.0.0.1 NITRO_PORT=5320 TZ=Asia/Shanghai
WORKDIR /app
COPY --from=builder --chown=node:node /runtime/ /app/runtime/
COPY --from=builder --chown=node:node /workspace/apps/platform-api/.output/ /app/api/
COPY --from=builder /workspace/apps/web-antd/dist/ /usr/share/nginx/html/
COPY deploy/single-image/nginx.conf /etc/nginx/nginx.conf
COPY deploy/single-image/supervisord.conf /etc/supervisor/rail.conf
COPY --chmod=755 deploy/single-image/entrypoint.sh /usr/local/bin/rail-entrypoint
COPY --chmod=755 deploy/single-image/healthcheck.sh /usr/local/bin/rail-healthcheck
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=4 CMD ["rail-healthcheck"]
ENTRYPOINT ["rail-entrypoint"]
CMD ["serve"]
