import crypto from "node:crypto"

import { MedusaError } from "@medusajs/framework/utils"

export type WriteReturnTokenInput = {
  token: string
  target: string
  ttlSeconds: number
  accountId: string
  namespaceId: string
  apiToken: string
  fetchImpl?: typeof fetch
}

export function generateToken(): string {
  const buf = new Uint8Array(16)
  crypto.webcrypto.getRandomValues(buf)
  let hex = ""
  for (const b of buf) hex += b.toString(16).padStart(2, "0")
  return `r_${hex.slice(0, 22)}`
}

export async function writeReturnToken(
  input: WriteReturnTokenInput
): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}` +
    `/storage/kv/namespaces/${input.namespaceId}/values/` +
    encodeURIComponent(input.token) +
    `?expiration_ttl=${input.ttlSeconds}`
  const res = await fetchImpl(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
      "Content-Type": "text/plain",
    },
    body: input.target,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `cloudflare kv write failed: ${res.status} ${detail.slice(0, 200)}`
    )
  }
}
