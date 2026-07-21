jest.mock('../instrument', () => ({ Sentry: { captureException: jest.fn() } }))

const runMock = jest.fn().mockResolvedValue({ result: [] })
jest.mock('@medusajs/medusa/core-flows', () => ({
  completeOrderWorkflow: jest.fn(() => ({ run: runMock })),
}))

import {
  AutoCompleteOrderRow,
  autoCompleteOrderIfDone,
  shouldAutoComplete,
} from '../auto-complete-order'

const capturedPayment = {
  provider_id: 'pp_via_broker_via_broker',
  amount: 81.9,
  canceled_at: null,
  captures: [{ amount: 81.9 }],
  refunds: [],
}

// Mirrors live query.graph quirks: null relation elements, quantities only on
// detail as raw bigNumber objects.
const doneOrder = (): AutoCompleteOrderRow => ({
  id: 'order_1',
  status: 'pending',
  metadata: null,
  items: [
    null,
    {
      id: 'item_1',
      quantity: undefined,
      detail: {
        raw_quantity: { value: '2', precision: 20 },
        raw_shipped_quantity: { value: '2', precision: 20 },
      },
    },
  ],
  fulfillments: [
    null,
    { id: 'ful_canceled', shipped_at: null, canceled_at: '2026-07-01T00:00:00Z' },
    { id: 'ful_1', shipped_at: '2026-07-20T10:00:00Z', canceled_at: null },
  ],
  payment_collections: [{ payments: [null, capturedPayment] }],
})

describe('shouldAutoComplete', () => {
  it('accepts a pending order that is fully shipped and fully captured', () => {
    expect(shouldAutoComplete(doneOrder())).toBe(true)
  })

  it('rejects any non-pending status (idempotency + never touch canceled/archived)', () => {
    for (const status of ['completed', 'canceled', 'archived', 'draft', undefined]) {
      expect(shouldAutoComplete({ ...doneOrder(), status })).toBe(false)
    }
  })

  it('rejects when there is no active fulfillment', () => {
    const o = doneOrder()
    o.fulfillments = [o.fulfillments![1]] // only the canceled one
    expect(shouldAutoComplete(o)).toBe(false)
    expect(shouldAutoComplete({ ...doneOrder(), fulfillments: [] })).toBe(false)
  })

  it('rejects when an active fulfillment is not shipped yet (label-only redo)', () => {
    const o = doneOrder()
    o.fulfillments!.push({ id: 'ful_redo', shipped_at: null, canceled_at: null })
    expect(shouldAutoComplete(o)).toBe(false)
  })

  it('rejects when an item is only partially shipped', () => {
    const o = doneOrder()
    o.items![1]!.detail!.raw_shipped_quantity = { value: '1', precision: 20 }
    expect(shouldAutoComplete(o)).toBe(false)
  })

  it('tolerates an unresolvable item quantity (falls back to the fulfillment check)', () => {
    const o = doneOrder()
    o.items = [{ id: 'item_1', detail: null }]
    expect(shouldAutoComplete(o)).toBe(true)
  })

  it('rejects when the payment is not fully captured', () => {
    const o = doneOrder()
    o.payment_collections = [
      { payments: [{ ...capturedPayment, captures: [{ amount: 40 }] }] },
    ]
    expect(shouldAutoComplete(o)).toBe(false)
  })

  it('rejects when the payment has a refund', () => {
    const o = doneOrder()
    o.payment_collections = [
      { payments: [{ ...capturedPayment, refunds: [{ amount: 10 }] }] },
    ]
    expect(shouldAutoComplete(o)).toBe(false)
  })

  it('rejects when there is no broker payment at all', () => {
    expect(shouldAutoComplete({ ...doneOrder(), payment_collections: [] })).toBe(false)
  })

  it('accepts an unpaid-by-broker order with a logged payment override (manual bank transfer)', () => {
    const o = doneOrder()
    o.payment_collections = []
    o.metadata = {
      fulfillment_checklist: {
        version: 1,
        items: {},
        package_closed: null,
        overrides: [
          {
            step: 'payment',
            reason: 'Handmatige bankoverschrijving ontvangen',
            at: '2026-07-20T09:00:00Z',
            by_id: 'usr_1',
            by_name: 'Operator',
          },
        ],
      },
    }
    expect(shouldAutoComplete(o)).toBe(true)
  })
})

describe('autoCompleteOrderIfDone', () => {
  const makeContainer = (order: unknown) => {
    const graph = jest.fn().mockResolvedValue({ data: order ? [order] : [] })
    const container = {
      resolve: jest.fn((key: string) => {
        if (key === 'query') return { graph }
        if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        return undefined
      }),
    } as any
    return { container, graph }
  }

  beforeEach(() => runMock.mockClear())

  it('completes the order when the guard passes', async () => {
    const { container, graph } = makeContainer(doneOrder())
    await expect(
      autoCompleteOrderIfDone(container, 'order_1', 'test')
    ).resolves.toBe(true)
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'order', filters: { id: 'order_1' } })
    )
    expect(runMock).toHaveBeenCalledWith({ input: { orderIds: ['order_1'] } })
  })

  it('does nothing when the guard rejects', async () => {
    const { container } = makeContainer({ ...doneOrder(), status: 'completed' })
    await expect(
      autoCompleteOrderIfDone(container, 'order_1', 'test')
    ).resolves.toBe(false)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('does nothing when the order cannot be loaded', async () => {
    const { container } = makeContainer(null)
    await expect(
      autoCompleteOrderIfDone(container, 'order_x', 'test')
    ).resolves.toBe(false)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('never throws when the query or workflow fails', async () => {
    const { container } = makeContainer(doneOrder())
    runMock.mockRejectedValueOnce(new Error('boom'))
    await expect(
      autoCompleteOrderIfDone(container, 'order_1', 'test')
    ).resolves.toBe(false)
  })
})
