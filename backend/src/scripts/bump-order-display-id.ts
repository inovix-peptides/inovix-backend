import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * One-off / repeatable bump of the order display_id sequence so customer-facing
 * order numbers are a 5-digit, ambiguous value instead of a low count (e.g. #14)
 * that leaks how many orders the shop has taken.
 *
 *   ORDER_DISPLAY_ID_START=28411  medusa exec ./src/scripts/bump-order-display-id.ts
 *
 * Behaviour:
 * - Reads the target floor from ORDER_DISPLAY_ID_START (or the first CLI arg),
 *   defaulting to 28411. This is the display_id the NEXT order will receive.
 * - IDEMPOTENT and one-directional: it only ever RAISES the sequence. If the
 *   sequence already points at or past the floor it is a no-op, so re-running
 *   can never reset numbering, create duplicates, or go backwards.
 * - Existing orders keep their current display_id. Only new orders are affected.
 *
 * display_id is read directly everywhere (storefront, admin, emails, DHL labels)
 * so bumping the sequence is the single, safe lever | no display-time transform
 * is needed.
 */
export default async function bumpOrderDisplayId({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const rawArg = String(process.env.ORDER_DISPLAY_ID_START ?? args?.[0] ?? "28411").trim()
  const floor = Number(rawArg)

  if (!Number.isInteger(floor) || floor < 1000 || floor > 2_000_000_000) {
    logger.error(`Invalid ORDER_DISPLAY_ID_START "${rawArg}". Pass a 4-9 digit integer.`)
    return
  }

  // Resolve the sequence backing "order".display_id (don't hardcode the name).
  const seqRes = await knex.raw(`SELECT pg_get_serial_sequence('"order"', 'display_id') AS seq`)
  const seqName: string | null = seqRes.rows?.[0]?.seq ?? null
  if (!seqName) {
    logger.error(`Could not resolve the sequence for "order".display_id; aborting.`)
    return
  }

  const stateRes = await knex.raw(`SELECT last_value, is_called FROM ${seqName}`)
  const { last_value, is_called } = stateRes.rows[0]
  const currentLast = Number(last_value)
  // The display_id the NEXT order would get under the current sequence state.
  const currentNext = is_called ? currentLast + 1 : currentLast

  if (currentNext >= floor) {
    logger.info(
      `No-op: ${seqName} already yields next display_id ${currentNext} (>= floor ${floor}).`,
    )
    return
  }

  // setval(seq, floor - 1, true) => the next nextval() returns exactly `floor`.
  await knex.raw(`SELECT setval('${seqName}', ?, true)`, [floor - 1])
  logger.info(
    `Bumped ${seqName}: next order display_id will be ${floor} (was ${currentNext}).`,
  )
}
