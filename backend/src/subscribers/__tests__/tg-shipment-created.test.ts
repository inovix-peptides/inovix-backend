jest.mock('../../lib/instrument', () => ({ Sentry: { captureException: jest.fn() } }))

import tgShipmentCreatedHandler from '../tg-shipment-created'

const order = {
  id: 'order_1',
  display_id: 28412,
  fulfillments: [
    { id: 'ful_1', labels: [{ tracking_number: 'JVGL1234567890' }] },
  ],
}

const makeContainer = (opts?: { link?: boolean; order?: unknown }) => {
  const notify = jest.fn().mockResolvedValue(true)
  const graph = jest.fn().mockImplementation(({ entity }: { entity: string }) => {
    if (entity === 'order_fulfillment') {
      return Promise.resolve({
        data: opts?.link === false ? [] : [{ order_id: 'order_1' }],
      })
    }
    if (entity === 'order') {
      const o = opts?.order === undefined ? order : opts.order
      return Promise.resolve({ data: o ? [o] : [] })
    }
    return Promise.resolve({ data: [] })
  })
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return { notify, isConfigured: () => true }
      if (key === 'query') return { graph }
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  } as any
  return { container, notify, graph }
}

describe('tg-shipment-created subscriber', () => {
  it('resolves the order via the order_fulfillment link, never via a cross-module fulfillments filter', async () => {
    const { container, notify, graph } = makeContainer()
    await tgShipmentCreatedHandler({ event: { data: { id: 'ful_1' } }, container } as any)

    // First call: link entity keyed by fulfillment_id (the broken SQL from
    // Sentry INOVIX-BACKEND-B came from filtering orders on fulfillments.id).
    expect(graph).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        entity: 'order_fulfillment',
        filters: { fulfillment_id: 'ful_1' },
      })
    )
    // Second call: order by its own id only.
    expect(graph).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ entity: 'order', filters: { id: 'order_1' } })
    )
    for (const call of graph.mock.calls) {
      expect(JSON.stringify(call[0].filters)).not.toContain('fulfillments')
    }

    expect(notify).toHaveBeenCalledWith(
      'tg-shipped-ful_1',
      'shipment_created',
      expect.stringContaining('#28412')
    )
    expect(notify.mock.calls[0][2]).toContain('JVGL1234567890')
  })

  it('does nothing when no order link exists for the fulfillment', async () => {
    const { container, notify, graph } = makeContainer({ link: false })
    await tgShipmentCreatedHandler({ event: { data: { id: 'ful_x' } }, container } as any)
    expect(graph).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('does nothing when the linked order cannot be loaded', async () => {
    const { container, notify } = makeContainer({ order: null })
    await tgShipmentCreatedHandler({ event: { data: { id: 'ful_1' } }, container } as any)
    expect(notify).not.toHaveBeenCalled()
  })

  it('never throws when the query fails (fire and forget)', async () => {
    const { container } = makeContainer()
    ;(container.resolve('query') as any).graph.mockRejectedValue(new Error('boom'))
    await expect(
      tgShipmentCreatedHandler({ event: { data: { id: 'ful_1' } }, container } as any)
    ).resolves.toBeUndefined()
  })
})
