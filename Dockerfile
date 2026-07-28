# syntax=docker/dockerfile:1.7

FROM node:22.23.1-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:22.23.1-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_EMAIL
ARG NEXT_PUBLIC_PHONE
ARG NEXT_PUBLIC_TG_USERNAME
ARG NEXT_PUBLIC_WA_NUMBER
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_YANDEX_METRICA_ID
ARG NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ARG NEXT_PUBLIC_YANDEX_VERIFICATION

ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_EMAIL=${NEXT_PUBLIC_EMAIL} \
    NEXT_PUBLIC_PHONE=${NEXT_PUBLIC_PHONE} \
    NEXT_PUBLIC_TG_USERNAME=${NEXT_PUBLIC_TG_USERNAME} \
    NEXT_PUBLIC_WA_NUMBER=${NEXT_PUBLIC_WA_NUMBER} \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID} \
    NEXT_PUBLIC_YANDEX_METRICA_ID=${NEXT_PUBLIC_YANDEX_METRICA_ID} \
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=${NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION} \
    NEXT_PUBLIC_YANDEX_VERIFICATION=${NEXT_PUBLIC_YANDEX_VERIFICATION}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# sharp is installed in a separate stage because the current repository lockfile
# does not declare it yet. Pinning the exact version keeps the image reproducible.
# Copy the complete node_modules tree from this stage: sharp has runtime helpers
# and platform-specific optional packages that must stay together.
FROM node:22.23.1-bookworm-slim AS sharp-runtime
WORKDIR /opt/sharp
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
RUN --mount=type=cache,target=/root/.npm \
    npm init -y >/dev/null 2>&1 \
    && npm install --omit=dev --package-lock=false sharp@0.34.5

FROM node:22.23.1-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=sharp-runtime --chown=nextjs:nodejs /opt/sharp/node_modules ./node_modules

RUN mkdir -p .next/cache /tmp \
    && chown -R nextjs:nodejs .next/cache /tmp

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
