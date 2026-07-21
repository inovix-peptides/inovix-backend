jest.mock('../../lib/instrument', () => ({ Sentry: { captureException: jest.fn() } }))
jest.mock('../../lib/auto-complete-order', () => ({
  autoCompleteOrderIfDone: jest.fn().mockResolvedValue(true),
}))

import orderAutoCompleteHandler, { config } from '../order-auto-complete'
import { autoCompleteOrderIfDone } from '../../lib/auto-complete-order'

const makeContainer = (opts?: { link?: boolean }) => {
  const graph = jest.fn().mockImplementation(({ entity }: { entity: string }) => {
    if (entity === 'order_fulfillment') {
      return Promise.resolve({
        data: opts?.link === false ? [] : [{ order_id: 'order_1' }],
      })
    }
    return Promise.resolve({ data: [] })
  })
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === 'query') return { graph }
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  } as any
  return { container, graph }
}

describe('order-auto-complete subscriber', () => {
  beforeEach(() => (autoCompleteOrderIfDone as jest.Mock).mockClear())

  it('listens to shipment.created', () => {
    expect(config.event).toBe('shipment.created')
  })

  it('resolves the order via the order_fulfillment link, never a cross-module fulfillments filter', async () => {
    const { container, graph } = makeContainer()
    await orderAutoCompleteHandler({ event: { data: { id: 'ful_1' } }, container } as any)

    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'order_fulfillment',
        filters: { fulfillment_id: 'ful_1' },
      })
    )
    for (const call of graph.mock.calls) {
      expect(JSON.stringify(call[0].filters)).not.toContain('fulfillments')
    }
    expect(autoCompleteOrderIfDone).toHaveBeenCalledWith(
      container,
      'order_1',
      'shipment.created'
    )
  })

  it('does nothing when no order link exists for the fulfillment', async () => {
    const { container } = makeContainer({ link: false })
    await orderAutoCompleteHandler({ event: { data: { id: 'ful_x' } }, container } as any)
    expect(autoCompleteOrderIfDone).not.toHaveBeenCalled()
  })

  it('never throws when the query fails', async () => {
    const { container } = makeContainer()
    ;(container.resolve('query') as any).graph.mockRejectedValue(new Error('boom'))
    await expect(
      orderAutoCompleteHandler({ event: { data: { id: 'ful_1' } }, container } as any)
    ).resolves.toBeUndefined()
  })
})
