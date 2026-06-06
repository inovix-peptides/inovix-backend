/**
 * DHL Parcel NL | end-to-end sandbox smoke test
 *
 * Targets the SANDBOX only: DHL_PARCEL_API_BASE_URL must be
 * https://api-gw-accept.dhlparcel.nl  (never the prod URL).
 *
 * Run:
 *   pnpm exec ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs"}' \
 *     src/scripts/dhl-parcel-e2e.ts
 *
 * If auth returns 401 the script exits after Step 1 with a clear
 * message pointing at TODO-BEFORE-LIVE.md. This is EXPECTED with the
 * current sandbox creds.
 */

import "dotenv/config"
import * as fs from "fs"
import * as crypto from "crypto"
import { DhlParcelClient } from "../modules/dhl-parcel/client"
import { TokenCache } from "../modules/dhl-parcel/token-cache"
import { DhlParcelAuthError, DhlParcelApiError } from "../modules/dhl-parcel/types"

// ─── Helpers ────────────────────────────────────────────────────────────────

function pass(step: string, detail = ""): void {
  const suffix = detail ? ` | ${detail}` : ""
  console.log(`[PASS] ${step}${suffix}`)
}

function fail(step: string, detail = ""): void {
  const suffix = detail ? ` | ${detail}` : ""
  console.error(`[FAIL] ${step}${suffix}`)
}

function info(msg: string): void {
  console.log(`       ${msg}`)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== DHL Parcel NL | sandbox e2e smoke test ===")
  console.log()

  // ── Env validation ─────────────────────────────────────────────────────────

  const baseUrl = process.env.DHL_PARCEL_API_BASE_URL ?? "https://api-gw-accept.dhlparcel.nl"
  const userId = process.env.DHL_PARCEL_USER_ID
  const key = process.env.DHL_PARCEL_KEY

  if (!userId || !key) {
    console.error("ERROR: DHL_PARCEL_USER_ID and/or DHL_PARCEL_KEY not set in .env")
    process.exit(1)
  }

  if (!baseUrl.includes("api-gw-accept")) {
    console.error(
      "SAFETY ABORT: DHL_PARCEL_API_BASE_URL does not look like the sandbox URL.\n" +
      "  Got:      " + baseUrl + "\n" +
      "  Expected: https://api-gw-accept.dhlparcel.nl\n" +
      "Refusing to run against production (a real label would be created and billed).",
    )
    process.exit(1)
  }

  console.log(`Sandbox URL: ${baseUrl}`)
  console.log(`User ID:     ${userId}`)
  console.log()

  const tokenCache = new TokenCache(baseUrl, userId, key)
  const client = new DhlParcelClient(baseUrl, tokenCache)

  // ── Step 1: Authenticate ───────────────────────────────────────────────────

  console.log("--- Step 1: Authenticate (POST /authenticate/api-key) ---")
  let accountId: string
  try {
    const accountNumbers = await client.getAccountNumbers()
    if (accountNumbers.length === 0) {
      throw new Error("Auth succeeded but returned zero account numbers")
    }
    accountId = accountNumbers[0]
    pass("Step 1: Auth", `token acquired, accountId=${accountId}`)
  } catch (err) {
    const isAuth =
      err instanceof DhlParcelAuthError ||
      (err instanceof DhlParcelApiError && err.status === 401) ||
      (err instanceof Error && err.message.includes("401"))

    if (isAuth) {
      fail("Step 1: Auth", "401 Unauthorized")
      console.error()
      console.error("  The DHL sandbox credentials in .env were rejected.")
      console.error("  Status: 401")
      console.error()
      console.error("  ACTION REQUIRED: see TODO-BEFORE-LIVE.md, item 1 (DHL credentials).")
      console.error("  Obtain valid sandbox keys from the DHL Parcel developer portal,")
      console.error("  update DHL_PARCEL_USER_ID + DHL_PARCEL_KEY in .env, then re-run.")
      console.error()
      console.error("  Steps 2-5 are SKIPPED (all require a valid token).")
    } else {
      fail("Step 1: Auth", String(err))
      console.error("  Unexpected error during auth:", err)
    }

    process.exit(1)
  }

  // ── Step 2: List ServicePoints near 1011AC ─────────────────────────────────

  console.log()
  console.log("--- Step 2: List ServicePoints near postcode 1011AC (NL) ---")
  let servicePointId: string
  try {
    const points = await client.listServicePoints("NL", { postalCode: "1011AC", limit: 5 })
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error("No service points returned for 1011AC")
    }
    servicePointId = points[0].id
    pass("Step 2: ServicePoints", `${points.length} returned, first id=${servicePointId}`)
    info(`First point: ${points[0].name}, ${points[0].address?.city ?? ""}`)
  } catch (err) {
    fail("Step 2: ServicePoints", String(err))
    info("Skipping Steps 3-5.")
    process.exit(1)
  }

  // ── Step 3: Create label (PS, SMALL, fake NL receiver) ────────────────────

  console.log()
  console.log("--- Step 3: Create label (POST /labels) ---")
  console.log("  parcelType: SMALL | option: PS (ServicePoint) + REFERENCE")
  console.log("  NOTE: HANDT omitted here because HANDT is mutually exclusive with PS per DHL capabilities.")

  const labelId = crypto.randomUUID()
  let trackingNumber: string | undefined
  let labelPdfBase64: string | undefined

  try {
    const labelResp = await client.createLabel({
      labelId,
      orderReference: "E2E-TEST",
      parcelTypeKey: "SMALL",
      accountId,
      options: [
        { key: "PS", input: servicePointId },
        { key: "REFERENCE", input: "E2E-TEST" },
      ],
      receiver: {
        name: { firstName: "Test", lastName: "Ontvanger" },
        address: {
          countryCode: "NL",
          postalCode: "1011AC",
          city: "Amsterdam",
          street: "Prins Hendrikkade",
          number: "108",
        },
        email: "test-ontvanger@example.com",
        phoneNumber: "+31612345678",
      },
      shipper: {
        name: { companyName: "Inovix Research" },
        address: {
          countryCode: "NL",
          postalCode: "1234AB",
          city: "Amsterdam",
          street: "Teststraat",
          number: "1",
        },
        email: "verzending@inovix-peptides.nl",
        phoneNumber: "+31698765432",
      },
    })

    trackingNumber = labelResp.pieces?.[0]?.trackerCode ?? labelResp.shipmentTrackerCode
    labelPdfBase64 = labelResp.pdf

    pass("Step 3: Create label", `trackingNumber=${trackingNumber}`)
    info(`shipmentId=${labelResp.shipmentId}`)
  } catch (err) {
    fail("Step 3: Create label", String(err))
    if (err instanceof DhlParcelApiError) {
      info(`HTTP ${err.status} from ${err.url}`)
      if (err.body) info(`Body: ${JSON.stringify(err.body)}`)
    }
    info("Skipping Steps 4-5.")
    process.exit(1)
  }

  // ── Step 4: Get label PDF ──────────────────────────────────────────────────

  console.log()
  console.log("--- Step 4: Obtain label PDF ---")

  // The POST /labels response may already include the PDF as base64.
  // If not, fetch it separately via getLabelPdf.
  if (!labelPdfBase64 && trackingNumber) {
    try {
      // labelId from the pieces array (first piece)
      const pieceLabel = await client.getLabelPdf(labelId)
      labelPdfBase64 = pieceLabel
      pass("Step 4: getLabelPdf", "PDF fetched separately")
    } catch (err) {
      fail("Step 4: getLabelPdf", String(err))
      if (err instanceof DhlParcelApiError) {
        info(`HTTP ${err.status} from ${err.url}`)
      }
      info("Continuing to Step 5 (PDF optional).")
    }
  } else if (labelPdfBase64) {
    pass("Step 4: PDF", "included in POST /labels response")
  } else {
    info("No PDF available (label creation did not return one and no piece labelId to fetch).")
  }

  // ── Step 5: Write PDF to disk ──────────────────────────────────────────────

  console.log()
  console.log("--- Step 5: Write label PDF to /tmp/dhl-test-label.pdf ---")

  if (labelPdfBase64) {
    try {
      // The value may be a raw base64 string or a data URI (data:application/pdf;base64,...)
      const raw = labelPdfBase64.includes(",")
        ? labelPdfBase64.split(",")[1]
        : labelPdfBase64
      const buf = Buffer.from(raw, "base64")
      fs.writeFileSync("/tmp/dhl-test-label.pdf", buf)
      pass("Step 5: PDF written", `/tmp/dhl-test-label.pdf (${buf.length} bytes)`)
    } catch (err) {
      fail("Step 5: PDF write", String(err))
    }
  } else {
    info("No PDF to write (skipped).")
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log()
  console.log("=== e2e smoke test complete ===")
  if (trackingNumber) {
    console.log(`Tracking number: ${trackingNumber}`)
    const postcode = "1011AC"
    console.log(
      `Tracking URL:    https://parcels.dhl.nl/dhlparcel/tracking?key=${trackingNumber}+${postcode}`,
    )
  }
}

main().catch((err) => {
  console.error("\nUnhandled error in e2e script:", err)
  process.exit(1)
})
