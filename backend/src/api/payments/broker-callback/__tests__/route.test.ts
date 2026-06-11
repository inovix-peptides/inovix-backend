import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

// Use the real PaymentActions string values so the route's comparisons
// behave exactly like production.
jest.mock("@medusajs/framework/utils", () => ({
  Modules: { PAYMENT: "paymentModule", WORKFLOW_ENGINE: "workflowEngine" },
  PaymentActions: {
    SUCCESSFUL: "captured",
    AUTHORIZED: "authorized",
    CANCELED: "canceled",
    FAILED: "failed",
    NOT_SUPPORTED: "not_supported",
    PENDING: "pending",
    REQUIRES_MORE: "requires_more",
  },
}))

jest.mock("@medusajs/medusa/core-flows", () => ({
  processPaymentWorkflowId: "process-payment-workflow",
}))

import { POST } from "../route"

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }

function mockRequest(input: {
  webhookResult?: unknown
  webhookError?: Error
  workflowError?: Error
}) {
  const getWebhookActionAndData = input.webhookError
    ? jest.fn().mockRejectedValue(input.webhookError)
    : jest.fn().mockResolvedValue(input.webhookResult)
  const run = input.workflowError
    ? jest.fn().mockRejectedValue(input.workflowError)
    : jest.fn().mockResolvedValue({})
  const req = {
    body: { ref: "pay_abc", status: "captured" },
    rawBody: Buffer.from(JSON.stringify({ ref: "pay_abc", status: "captured" })),
    headers: { "x-signature": "sig", "x-timestamp": "123" },
    scope: {
      resolve: jest.fn((key: string) => {
        if (key === "logger") return mockLogger
        if (key === "paymentModule") return { getWebhookActionAndData }
        if (key === "workflowEngine") return { run }
        return undefined
      }),
    },
  } as unknown as MedusaRequest
  return { req, getWebhookActionAndData, run }
}

function mockResponse() {
  const res: Record<string, jest.Mock> = {}
  res.status = jest.fn().mockReturnValue(res)
  res.type = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  return res as unknown as MedusaResponse & {
    status: jest.Mock
    send: jest.Mock
  }
}

describe("POST /payments/broker-callback", () => {
  beforeEach(() => jest.clearAllMocks())

  test("captured action runs processPaymentWorkflow with the event", async () => {
    const event = {
      action: "captured",
      data: { session_id: "pay_abc", amount: undefined },
    }
    const { req, run } = mockRequest({ webhookResult: event })
    const res = mockResponse()

    await POST(req, res)

    expect(run).toHaveBeenCalledWith("process-payment-workflow", {
      input: event,
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test("authorized action also runs the workflow", async () => {
    const event = {
      action: "authorized",
      data: { session_id: "pay_abc", amount: undefined },
    }
    const { req, run } = mockRequest({ webhookResult: event })
    const res = mockResponse()

    await POST(req, res)

    expect(run).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test.each(["failed", "canceled", "not_supported", "requires_more"])(
    "%s action is acknowledged without running the workflow",
    async (action) => {
      const { req, run } = mockRequest({
        webhookResult: { action, data: { session_id: "pay_abc" } },
      })
      const res = mockResponse()

      await POST(req, res)

      expect(run).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    }
  )

  test("missing event data is acknowledged without running the workflow", async () => {
    const { req, run } = mockRequest({
      webhookResult: { action: "captured", data: undefined },
    })
    const res = mockResponse()

    await POST(req, res)

    expect(run).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test("getWebhookActionAndData failure still acks 200 and logs", async () => {
    const { req, run } = mockRequest({ webhookError: new Error("boom") })
    const res = mockResponse()

    await POST(req, res)

    expect(run).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test("workflow failure still acks 200 and logs (reconcile cron is the net)", async () => {
    const { req } = mockRequest({
      webhookResult: {
        action: "captured",
        data: { session_id: "pay_abc", amount: undefined },
      },
      workflowError: new Error("workflow exploded"),
    })
    const res = mockResponse()

    await POST(req, res)

    expect(mockLogger.error).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
