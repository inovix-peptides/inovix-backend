import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// Custom error handler that de-masks Medusa's "unknown error" default branch.
// Parity target: @medusajs/framework/dist/http/middlewares/error-handler.js and
// exception-formatter.js (framework v2.12.1). If Medusa is upgraded, re-check
// both files against the switch and normalizePostgresError below.

export type FriendlyError = { status: number; message: string }

// Curated matchers for low-level errors that Medusa does NOT convert and would
// otherwise mask as "An unknown error occurred." Postgres codes are handled by
// normalizePostgresError below (parity with Medusa), not here. First match wins.
export function mapKnownError(err: any): FriendlyError | null {
  const name: string = err?.name ?? ""
  const message: string = err?.message ?? ""

  // MikroORM required-value validation, e.g. a variant saved without a value
  // for a product option:
  // "Value for ProductOptionValue.value is required, 'undefined' found"
  const requiredMatch = message.match(/Value for (\w+)\.\w+ is required/)
  if (name === "ValidationError" && requiredMatch) {
    const entity = requiredMatch[1]
    if (entity === "ProductOptionValue") {
      return {
        status: 400,
        message:
          "This variant is missing a value for a product option. Fill in a value for every option before saving.",
      }
    }
    return { status: 400, message: `A required value is missing for ${entity}.` }
  }

  return null
}

// Mirror of Medusa's formatException (exception-formatter.js, v2.12.1): map the
// Postgres codes Medusa recognizes to MedusaError types so they flow through the
// same switch and keep Medusa's status codes (422 / 404 / 409 / 400). We do not
// import Medusa's internal formatException (it is not publicly exported).
function normalizePostgresError(err: any): any {
  switch (err?.code) {
    case "23505": // unique_violation
      return new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "A record with these details already exists (for example a duplicate SKU or handle). Use unique values."
      )
    case "23503": // foreign_key_violation
      return new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "A referenced record does not exist."
      )
    case "40001": // serialization_failure (retryable; switch overrides the message)
      return new MedusaError(
        MedusaError.Types.CONFLICT,
        err?.detail ?? err?.message ?? "Serialization failure."
      )
    case "23502": { // not_null_violation
      const column: string = err?.column ?? ""
      return new MedusaError(
        MedusaError.Types.INVALID_DATA,
        column
          ? `A required field is missing: ${column}.`
          : "A required field is missing."
      )
    }
    default:
      return err
  }
}

// Parity constants copied from Medusa's default error handler.
const QUERY_RUNNER_RELEASED = "QueryRunnerAlreadyReleasedError"
const TRANSACTION_STARTED = "TransactionAlreadyStartedError"
const TRANSACTION_NOT_STARTED = "TransactionNotStartedError"
const API_ERROR = "api_error"
const INVALID_REQUEST_ERROR = "invalid_request_error"
const INVALID_STATE_ERROR = "invalid_state_error"

export const friendlyErrorHandler = (
  err: any,
  req: MedusaRequest,
  res: MedusaResponse,
  _next: MedusaNextFunction
): void => {
  // Match Medusa: normalize recognized Postgres errors into MedusaError types
  // before classifying, so they keep Medusa's exact status codes.
  err = normalizePostgresError(err)

  const logger: any = req.scope
    ? req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    : console

  const errorType = err?.type || err?.name
  const errObj: { code?: string; type?: string; message?: string } = {
    code: err?.code,
    type: err?.type,
    message: err?.message,
  }
  let statusCode = 500

  switch (errorType) {
    case QUERY_RUNNER_RELEASED:
    case TRANSACTION_STARTED:
    case TRANSACTION_NOT_STARTED:
    case MedusaError.Types.CONFLICT:
      statusCode = 409
      errObj.code = INVALID_STATE_ERROR
      errObj.message =
        "The request conflicted with another request. You may retry the request with the provided Idempotency-Key."
      break
    case MedusaError.Types.UNAUTHORIZED:
      statusCode = 401
      break
    case MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR:
      statusCode = 422
      break
    case MedusaError.Types.DUPLICATE_ERROR:
      statusCode = 422
      errObj.code = INVALID_REQUEST_ERROR
      break
    case MedusaError.Types.NOT_ALLOWED:
    case MedusaError.Types.INVALID_DATA:
      statusCode = 400
      break
    case MedusaError.Types.NOT_FOUND:
      statusCode = 404
      break
    case MedusaError.Types.DB_ERROR:
      statusCode = 500
      errObj.code = API_ERROR
      break
    case MedusaError.Types.UNEXPECTED_STATE:
    case MedusaError.Types.INVALID_ARGUMENT:
      break
    default: {
      // Inovix customization of Medusa's masked "unknown" branch.
      const mapped = mapKnownError(err)
      if (mapped) {
        statusCode = mapped.status
        errObj.code = INVALID_REQUEST_ERROR
        errObj.type = MedusaError.Types.INVALID_DATA
        errObj.message = mapped.message
      } else if (req.originalUrl?.startsWith("/admin")) {
        // Authenticated operator: show the real reason instead of masking it.
        statusCode = 500
        errObj.code = API_ERROR
        errObj.type = API_ERROR
        errObj.message =
          err?.message || "An unexpected error occurred. Check the server logs."
      } else {
        // Public / store routes: keep the generic message, no internal leakage.
        statusCode = 500
        errObj.code = "unknown_error"
        errObj.type = "unknown_error"
        errObj.message = "An unknown error occurred."
      }
      break
    }
  }

  if (statusCode >= 500) {
    logger.error(err)
  } else {
    logger.info(err?.message)
  }

  // Validation issues (e.g. request-body validation) become a 400 list.
  if (err && Array.isArray(err.issues)) {
    const messages = err.issues.map(
      (issue: any) => `${(issue.path ?? []).join(".")}: ${issue.message}`
    )
    res.status(statusCode).json({
      type: MedusaError.Types.INVALID_DATA,
      message: messages.join("\n"),
    })
    return
  }

  res.status(statusCode).json(errObj)
}
