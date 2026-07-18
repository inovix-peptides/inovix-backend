import type { Event as SentryEvent } from "@sentry/node"

/**
 * Sentry issue INOVIX-BACKEND-9: local `medusa develop` runs on the dev
 * machine lose their Redis connection (Redis not running / laptop sleep) and
 * the framework-owned ioredis clients (event-bus-redis, workflow-engine-redis,
 * cache-redis) reject their queued commands with "Connection is closed." once
 * retries are exhausted. Medusa does not catch those internal promises, so
 * Sentry's global onunhandledrejection hook captures them as errors.
 *
 * These are benign reconnect noise from dev, never seen in production, so we
 * drop them | but ONLY outside production. A real Redis outage on Railway
 * still produces events (environment "production") and stays visible.
 */
export function isBenignRedisDisconnectEvent(
  event: SentryEvent,
  environment: string
): boolean {
  if (environment === "production") {
    return false
  }

  const values = event.exception?.values ?? []
  if (values.length === 0) {
    return false
  }

  return values.some((value) => {
    // Only auto-captured events (unhandled rejection / uncaught exception),
    // never explicit Sentry.captureException calls.
    if (value.mechanism?.handled !== false) {
      return false
    }
    if (value.value !== "Connection is closed.") {
      return false
    }
    // Must originate from ioredis itself.
    const frames = value.stacktrace?.frames ?? []
    return frames.some(
      (frame) =>
        typeof frame.filename === "string" &&
        (frame.filename.includes("/ioredis/") ||
          frame.filename.includes("\\ioredis\\"))
    )
  })
}
