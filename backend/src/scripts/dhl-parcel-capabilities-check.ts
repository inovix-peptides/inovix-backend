import "dotenv/config"
import { DhlParcelClient } from "../modules/dhl-parcel/client"
import { TokenCache } from "../modules/dhl-parcel/token-cache"

async function main() {
  const baseUrl = process.env.DHL_PARCEL_API_BASE_URL ?? "https://api-gw-accept.dhlparcel.nl"
  const userId = process.env.DHL_PARCEL_USER_ID
  const key = process.env.DHL_PARCEL_KEY

  if (!userId || !key) {
    console.error("ERROR: DHL_PARCEL_USER_ID and/or DHL_PARCEL_KEY are not set in .env")
    process.exit(1)
  }

  console.log(`Calling DHL Parcel capabilities endpoint on: ${baseUrl}`)
  console.log("Query: fromCountry=NL, toCountry=NL, toBusiness=false")
  console.log("---")

  const tokenCache = new TokenCache(baseUrl, userId, key)
  const client = new DhlParcelClient(baseUrl, tokenCache)

  const result = await client.getCapabilities({
    fromCountry: "NL",
    toCountry: "NL",
    toBusiness: false,
  })

  // Full raw response
  console.log("=== FULL CAPABILITIES RESPONSE ===")
  console.log(JSON.stringify(result, null, 2))

  // Extract relevant keys for easy reading
  console.log("\n=== RELEVANT KEY SUMMARY ===")

  const capabilities = result as any

  // Handle both array and object response shapes
  const capList: any[] = Array.isArray(capabilities)
    ? capabilities
    : capabilities?.capabilities ?? capabilities?.data ?? []

  // Collect all option keys across all capability entries
  const allOptionKeys = new Set<string>()
  const allParcelTypeKeys = new Set<string>()

  for (const cap of capList) {
    // Options
    const options: any[] = cap?.options ?? []
    for (const opt of options) {
      if (opt?.key) allOptionKeys.add(opt.key)
    }

    // Parcel types
    const parcelTypes: any[] = cap?.parcelTypes ?? cap?.parcel_types ?? []
    for (const pt of parcelTypes) {
      if (typeof pt === "string") allParcelTypeKeys.add(pt)
      else if (pt?.key) allParcelTypeKeys.add(pt.key)
      else if (pt?.name) allParcelTypeKeys.add(pt.name)
    }
  }

  // Signature / handtekening related option keys
  const signatureKeys = [...allOptionKeys].filter((k) => {
    const lower = k.toLowerCase()
    return (
      lower.includes("handt") ||
      lower.includes("sign") ||
      lower.includes("handteken") ||
      lower.includes("sig")
    )
  })

  console.log(
    "\nAll option keys found:",
    allOptionKeys.size > 0 ? [...allOptionKeys].join(", ") : "(none extracted — check raw output above)",
  )
  console.log(
    "Signature-related option keys:",
    signatureKeys.length > 0 ? signatureKeys.join(", ") : "(none matched — check raw output above)",
  )
  console.log(
    "Parcel-type keys found:",
    allParcelTypeKeys.size > 0 ? [...allParcelTypeKeys].join(", ") : "(none extracted — check raw output above)",
  )

  // NOTE: Confirmed real DHL keys are XSMALL, SMALL, SMALL_MEDIUM, MEDIUM.
  // LARGE does not exist; old enum had LARGE instead of XSMALL + SMALL_MEDIUM.
  const expectedParcelTypes = ["XSMALL", "SMALL", "SMALL_MEDIUM", "MEDIUM"]
  const missing = expectedParcelTypes.filter((k) => !allParcelTypeKeys.has(k))
  const extra = [...allParcelTypeKeys].filter((k) => !expectedParcelTypes.includes(k))

  if (allParcelTypeKeys.size > 0) {
    if (missing.length === 0 && extra.length === 0) {
      console.log("Parcel-type keys MATCH expected [XSMALL, SMALL, SMALL_MEDIUM, MEDIUM].")
    } else {
      if (missing.length > 0) console.log("MISSING expected parcel-type keys:", missing.join(", "))
      if (extra.length > 0) console.log("EXTRA parcel-type keys (not in enum):", extra.join(", "))
    }
  }
}

main().catch((err) => {
  console.error("Script failed:", err)
  process.exit(1)
})
