import * as Sentry from "@sentry/node"

import { isBenignRedisDisconnectEvent } from "./sentry-filters"

const dsn = process.env.SENTRY_DSN

// Medusa loads this file twice in production (once from the source-tree
// medusa-config and once from the bundled copy under .medusa/server, each
// resolving @sentry/node from a different node_modules). Without this guard
// both copies patch http.Server and every request infinite-recurses through
// the two wrappers (RangeError: Maximum call stack size exceeded).
const SENTRY_INIT_FLAG = "__INOVIX_SENTRY_INITIALIZED__"

if (dsn && !(globalThis as Record<string, unknown>)[SENTRY_INIT_FLAG]) {
  (globalThis as Record<string, unknown>)[SENTRY_INIT_FLAG] = true
  const environment =
    process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development"
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    sendDefaultPii: false,
    // Drop dev-only ioredis reconnect noise (INOVIX-BACKEND-9); see
    // sentry-filters.ts. Production events are never dropped.
    beforeSend(event) {
      return isBenignRedisDisconnectEvent(event, environment) ? null : event
    },
  })
}

export { Sentry }
