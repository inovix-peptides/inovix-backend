import type { Event as SentryEvent } from "@sentry/node"

import { isBenignRedisDisconnectEvent } from "../sentry-filters"

/**
 * Event shape mirrors the real INOVIX-BACKEND-9 event
 * (f77d0abed16f4ac89524651e62a966cb): unhandled rejection of
 * "Connection is closed." raised from ioredis' connectionCloseHandler.
 */
function makeEvent(overrides?: {
  message?: string
  handled?: boolean
  filename?: string
}): SentryEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: "Error",
          value: overrides?.message ?? "Connection is closed.",
          mechanism: {
            type: "auto.node.onunhandledrejection",
            handled: overrides?.handled ?? false,
          },
          stacktrace: {
            frames: [
              {
                function: "EventEmitter.connectionCloseHandler",
                filename:
                  overrides?.filename ??
                  "/app/node_modules/ioredis/built/Redis.js",
                in_app: false,
              },
              {
                function: "processTicksAndRejections",
                filename: "node:internal/process/task_queues",
                in_app: false,
              },
            ],
          },
        },
      ],
    },
  }
}

describe("isBenignRedisDisconnectEvent", () => {
  it("drops the ioredis 'Connection is closed.' unhandled rejection in development", () => {
    expect(isBenignRedisDisconnectEvent(makeEvent(), "development")).toBe(true)
  })

  it("drops it in any non-production environment (e.g. staging)", () => {
    expect(isBenignRedisDisconnectEvent(makeEvent(), "staging")).toBe(true)
  })

  it("never drops production events, even matching ones", () => {
    expect(isBenignRedisDisconnectEvent(makeEvent(), "production")).toBe(false)
  })

  it("keeps explicitly captured errors (mechanism handled: true)", () => {
    expect(
      isBenignRedisDisconnectEvent(makeEvent({ handled: true }), "development")
    ).toBe(false)
  })

  it("keeps errors with a different message", () => {
    expect(
      isBenignRedisDisconnectEvent(
        makeEvent({ message: "connect ECONNREFUSED 127.0.0.1:6379" }),
        "development"
      )
    ).toBe(false)
  })

  it("keeps same-message errors that do not originate from ioredis", () => {
    expect(
      isBenignRedisDisconnectEvent(
        makeEvent({ filename: "/app/src/lib/some-module.ts" }),
        "development"
      )
    ).toBe(false)
  })

  it("keeps events without exception values", () => {
    expect(
      isBenignRedisDisconnectEvent({ type: undefined }, "development")
    ).toBe(false)
  })

  it("matches Windows-style ioredis paths too", () => {
    expect(
      isBenignRedisDisconnectEvent(
        makeEvent({
          filename: "C:\\app\\node_modules\\ioredis\\built\\Redis.js",
        }),
        "development"
      )
    ).toBe(true)
  })
})
