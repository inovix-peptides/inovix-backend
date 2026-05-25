import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { createConnection } from "net"

const REDIS_URL = process.env.REDIS_URL

/**
 * RESP-level Redis PING. Avoids adding ioredis as a direct dep just for /health.
 * Returns true only on a `+PONG` reply within the timeout.
 */
function pingRedis(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch { /* noop */ }
      resolve(ok)
    }

    let u: URL
    try { u = new URL(url) } catch { resolve(false); return }
    if (u.protocol !== "redis:") { resolve(false); return } // rediss not used on Railway internal

    const socket = createConnection({
      host: u.hostname,
      port: Number(u.port || 6379),
    })

    const timer = setTimeout(() => done(false), timeoutMs)
    let buf = ""

    socket.once("connect", () => {
      const user = decodeURIComponent(u.username || "")
      const pass = decodeURIComponent(u.password || "")
      let cmd = ""
      if (pass) {
        cmd += user
          ? `*3\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(user)}\r\n${user}\r\n$${Buffer.byteLength(pass)}\r\n${pass}\r\n`
          : `*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(pass)}\r\n${pass}\r\n`
      }
      cmd += `*1\r\n$4\r\nPING\r\n`
      socket.write(cmd)
    })

    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8")
      if (buf.includes("+PONG\r\n")) { clearTimeout(timer); done(true) }
      else if (buf.includes("-")) { clearTimeout(timer); done(false) }
    })

    socket.once("error", () => { clearTimeout(timer); done(false) })
    socket.once("close", () => { clearTimeout(timer); done(false) })
  })
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const redisStatus: "ok" | "down" | "not_configured" = REDIS_URL
    ? (await pingRedis(REDIS_URL)) ? "ok" : "down"
    : "not_configured"

  const healthy = redisStatus !== "down"

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    redis: redisStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
}
