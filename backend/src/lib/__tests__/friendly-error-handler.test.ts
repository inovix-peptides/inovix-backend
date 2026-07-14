import { mapKnownError, friendlyErrorHandler } from "../friendly-error-handler"
import { MedusaError } from "@medusajs/framework/utils"

describe("mapKnownError", () => {
  it("maps a missing product-option value to a 400 with clear copy", () => {
    const err: any = new Error(
      "Value for ProductOptionValue.value is required, 'undefined' found"
    )
    err.name = "ValidationError"
    expect(mapKnownError(err)).toEqual({
      status: 400,
      message:
        "This variant is missing a value for a product option. Fill in a value for every option before saving.",
    })
  })

  it("maps other MikroORM required-value errors to a generic 400", () => {
    const err: any = new Error("Value for ShippingOption.name is required, 'undefined' found")
    err.name = "ValidationError"
    expect(mapKnownError(err)).toEqual({
      status: 400,
      message: "A required value is missing for ShippingOption.",
    })
  })

  it("returns null for errors it does not curate (Postgres codes are normalized upstream)", () => {
    expect(mapKnownError(new Error("something else entirely"))).toBeNull()
    const pg: any = new Error("duplicate key value violates unique constraint")
    pg.code = "23505"
    expect(mapKnownError(pg)).toBeNull()
  })
})

function makeReq(originalUrl: string): any {
  const logger = { error: () => {}, info: () => {} }
  return { originalUrl, scope: { resolve: () => logger } }
}

function makeRes(): any {
  const res: any = { statusCode: undefined, body: undefined }
  res.status = (code: number) => {
    res.statusCode = code
    return res
  }
  res.json = (body: any) => {
    res.body = body
    return res
  }
  return res
}

const noop: any = () => {}

describe("friendlyErrorHandler", () => {
  it("de-masks a missing option value into a 400 with clear copy", () => {
    const err: any = new Error(
      "Value for ProductOptionValue.value is required, 'undefined' found"
    )
    err.name = "ValidationError"
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/products/p/variants"), res, noop)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toMatch(/missing a value for a product option/)
  })

  it("maps a Postgres unique violation (23505) to a 422", () => {
    const err: any = new Error("duplicate key value violates unique constraint")
    err.code = "23505"
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/products"), res, noop)
    expect(res.statusCode).toBe(422)
    expect(res.body.message).toMatch(/already exists/)
  })

  it("maps a Postgres foreign-key violation (23503) to a 404 (Medusa parity)", () => {
    const err: any = new Error("violates foreign key constraint")
    err.code = "23503"
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/products/p"), res, noop)
    expect(res.statusCode).toBe(404)
  })

  it("maps a Postgres serialization failure (40001) to a retryable 409 (Medusa parity)", () => {
    const err: any = new Error("could not serialize access due to concurrent update")
    err.code = "40001"
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/orders/o"), res, noop)
    expect(res.statusCode).toBe(409)
    expect(res.body.message).toMatch(/retry the request with the provided Idempotency-Key/)
  })

  it("maps a Postgres not-null violation (23502) to a 400", () => {
    const err: any = new Error("null value in column violates not-null constraint")
    err.code = "23502"
    err.column = "title"
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/products"), res, noop)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toContain("title")
  })

  it("leaves a recognized MedusaError (NOT_FOUND) unchanged at 404", () => {
    const err = new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/products/p"), res, noop)
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe("Product not found")
  })

  it("surfaces the real message for an unknown error on an admin route", () => {
    const err: any = new Error("some deep internal boom")
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/orders/o"), res, noop)
    expect(res.statusCode).toBe(500)
    expect(res.body.message).toBe("some deep internal boom")
    expect(res.body.type).toBe("api_error")
  })

  it("keeps the generic message for an unknown error on a store route", () => {
    const err: any = new Error("some deep internal boom")
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/store/carts/c"), res, noop)
    expect(res.statusCode).toBe(500)
    expect(res.body.message).toBe("An unknown error occurred.")
    expect(res.body.type).toBe("unknown_error")
  })

  it("formats validation issues into a 400 message", () => {
    const err: any = new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid request")
    err.issues = [{ path: ["title"], message: "Required" }]
    const res = makeRes()
    friendlyErrorHandler(err, makeReq("/admin/products"), res, noop)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toContain("title: Required")
  })
})
