import orderCustomerNoteHandler from '../order-customer-note'

jest.mock('../../lib/instrument', () => ({
  Sentry: { captureException: jest.fn() },
}))

// In-memory order + cart so the handler exercises the real merge and the real
// write queue rather than a stubbed update.
function makeContainer(opts: {
  orderMetadata?: Record<string, unknown> | null
  cartMetadata?: Record<string, unknown> | null
  failUpdate?: boolean
}) {
  let metadata: Record<string, unknown> | null = opts.orderMetadata ?? null
  const retrieveOrder = jest.fn(async () => ({ id: 'ord_1', metadata }))
  const updateOrders = jest.fn(
    async (updates: Array<{ id: string; metadata: Record<string, unknown> }>) => {
      if (opts.failUpdate) throw new Error('write failed')
      metadata = updates[0].metadata
    }
  )
  const retrieveCart = jest.fn(async () => ({
    id: 'cart_1',
    metadata: opts.cartMetadata ?? null,
  }))
  const graph = jest.fn(async () => ({ data: [{ cart_id: 'cart_1' }] }))
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

  return {
    updateOrders,
    logger,
    getMetadata: () => metadata,
    resolve: jest.fn((key: string) => {
      if (key === 'order') return { retrieveOrder, updateOrders }
      if (key === 'cart') return { retrieveCart }
      if (key === 'query') return { graph }
      if (key === 'logger') return logger
      return undefined
    }),
  }
}

function run(container: ReturnType<typeof makeContainer>) {
  return orderCustomerNoteHandler({
    event: { data: { id: 'ord_1' } },
    container: container as never,
  } as never)
}

describe('order-customer-note subscriber', () => {
  it('copies the cart note onto order.metadata.customer_note', async () => {
    const c = makeContainer({ cartMetadata: { customer_note: 'Graag zonder bel' } })
    await run(c)
    expect(c.getMetadata()).toEqual({ customer_note: 'Graag zonder bel' })
  })

  it('preserves other metadata keys', async () => {
    const c = makeContainer({
      orderMetadata: { fulfillment_checklist: { items: {} } },
      cartMetadata: { customer_note: 'let op' },
    })
    await run(c)
    const meta = c.getMetadata() as Record<string, unknown>
    expect(meta.fulfillment_checklist).toEqual({ items: {} })
    expect(meta.customer_note).toBe('let op')
  })

  it('migrates a legacy delivery_notes value off the cart', async () => {
    const c = makeContainer({ cartMetadata: { delivery_notes: 'oude sleutel' } })
    await run(c)
    expect((c.getMetadata() as Record<string, unknown>).customer_note).toBe('oude sleutel')
  })

  it('writes nothing when there is no note', async () => {
    const c = makeContainer({ cartMetadata: { locale: 'nl' } })
    await run(c)
    expect(c.updateOrders).not.toHaveBeenCalled()
  })

  it('is idempotent: a second run does not write again', async () => {
    const c = makeContainer({ cartMetadata: { customer_note: 'een keer' } })
    await run(c)
    await run(c)
    expect(c.updateOrders).toHaveBeenCalledTimes(1)
  })

  it('swallows write failures so order placement is never broken', async () => {
    const c = makeContainer({
      cartMetadata: { customer_note: 'kapot' },
      failUpdate: true,
    })
    await expect(run(c)).resolves.toBeUndefined()
    expect(c.logger.error).toHaveBeenCalled()
  })
})
