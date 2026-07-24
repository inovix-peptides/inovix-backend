import {
  customerNoteFromOrder,
  MAX_CUSTOMER_NOTE_LENGTH,
  resolveOrderCustomerNote,
  sanitizeCustomerNote,
  truncateCustomerNote,
} from '../customer-note'

// Builds a container whose order/cart/query pieces can each be dialled in
// independently, so every resolution path gets its own case.
function makeContainer(opts: {
  orderMetadata?: Record<string, unknown> | null
  cartMetadata?: Record<string, unknown> | null
  cartId?: string | null
  throwOn?: 'order' | 'query' | 'cart'
}) {
  const retrieveOrder = jest.fn(async () => {
    if (opts.throwOn === 'order') throw new Error('order module down')
    return { id: 'ord_1', metadata: opts.orderMetadata ?? null }
  })
  const retrieveCart = jest.fn(async () => {
    if (opts.throwOn === 'cart') throw new Error('cart module down')
    return { id: 'cart_1', metadata: opts.cartMetadata ?? null }
  })
  const graph = jest.fn(async () => {
    if (opts.throwOn === 'query') throw new Error('query down')
    return { data: opts.cartId === null ? [] : [{ cart_id: opts.cartId ?? 'cart_1' }] }
  })
  return {
    graph,
    resolve: jest.fn((key: string) => {
      if (key === 'order') return { retrieveOrder }
      if (key === 'cart') return { retrieveCart }
      if (key === 'query') return { graph }
      return undefined
    }),
  }
}

describe('sanitizeCustomerNote', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeCustomerNote('  graag bellen  ')).toBe('graag bellen')
  })

  it('collapses runs of blank lines but keeps a single break', () => {
    expect(sanitizeCustomerNote('een\n\n\n\ntwee')).toBe('een\n\ntwee')
    expect(sanitizeCustomerNote('een\ntwee')).toBe('een\ntwee')
  })

  it('normalizes CRLF', () => {
    expect(sanitizeCustomerNote('een\r\ntwee')).toBe('een\ntwee')
  })

  it('caps at the shared maximum length', () => {
    const note = sanitizeCustomerNote('x'.repeat(900))
    expect(note).toHaveLength(MAX_CUSTOMER_NOTE_LENGTH)
  })

  it('returns null for empty, whitespace-only and non-strings', () => {
    expect(sanitizeCustomerNote('')).toBeNull()
    expect(sanitizeCustomerNote('   \n  ')).toBeNull()
    expect(sanitizeCustomerNote(undefined)).toBeNull()
    expect(sanitizeCustomerNote(null)).toBeNull()
    expect(sanitizeCustomerNote(42)).toBeNull()
    expect(sanitizeCustomerNote({ customer_note: 'x' })).toBeNull()
  })
})

describe('customerNoteFromOrder', () => {
  it('reads the current key', () => {
    expect(customerNoteFromOrder({ metadata: { customer_note: 'hallo' } })).toBe('hallo')
  })

  it('falls back to the legacy delivery_notes key', () => {
    expect(customerNoteFromOrder({ metadata: { delivery_notes: 'oud' } })).toBe('oud')
  })

  it('prefers the current key when both are present', () => {
    expect(
      customerNoteFromOrder({ metadata: { customer_note: 'nieuw', delivery_notes: 'oud' } })
    ).toBe('nieuw')
  })

  it('returns null for missing or malformed metadata', () => {
    expect(customerNoteFromOrder({ metadata: null })).toBeNull()
    expect(customerNoteFromOrder({})).toBeNull()
    expect(customerNoteFromOrder({ metadata: { customer_note: '  ' } })).toBeNull()
  })
})

describe('resolveOrderCustomerNote', () => {
  it('returns the note already stored on the order without touching the cart', async () => {
    const c = makeContainer({ orderMetadata: { customer_note: 'op de order' } })
    await expect(resolveOrderCustomerNote(c as never, 'ord_1')).resolves.toBe('op de order')
    expect(c.graph).not.toHaveBeenCalled()
  })

  it('falls back to the linked cart when the order has no note', async () => {
    const c = makeContainer({
      orderMetadata: { locale: 'nl' },
      cartMetadata: { customer_note: 'op de cart' },
    })
    await expect(resolveOrderCustomerNote(c as never, 'ord_1')).resolves.toBe('op de cart')
    expect(c.graph).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'order_cart', filters: { order_id: 'ord_1' } })
    )
  })

  it('reads a legacy delivery_notes value off the cart', async () => {
    const c = makeContainer({ cartMetadata: { delivery_notes: 'oude sleutel' } })
    await expect(resolveOrderCustomerNote(c as never, 'ord_1')).resolves.toBe('oude sleutel')
  })

  it('returns null when there is no cart link', async () => {
    const c = makeContainer({ cartId: null })
    await expect(resolveOrderCustomerNote(c as never, 'ord_1')).resolves.toBeNull()
  })

  it('returns null when there is no note anywhere', async () => {
    const c = makeContainer({ orderMetadata: {}, cartMetadata: { locale: 'de' } })
    await expect(resolveOrderCustomerNote(c as never, 'ord_1')).resolves.toBeNull()
  })

  it.each(['order', 'query', 'cart'] as const)(
    'never throws when the %s lookup fails',
    async (throwOn) => {
      const c = makeContainer({ cartMetadata: { customer_note: 'x' }, throwOn })
      await expect(resolveOrderCustomerNote(c as never, 'ord_1')).resolves.toBeNull()
    }
  )
})

describe('truncateCustomerNote', () => {
  it('leaves a short note untouched', () => {
    expect(truncateCustomerNote('kort', 20)).toBe('kort')
  })

  it('truncates with an ellipsis and no trailing space', () => {
    const out = truncateCustomerNote('een hele lange opmerking', 10)
    // At most `max`: trimming a trailing space can make it one shorter.
    expect(out.length).toBeLessThanOrEqual(10)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/ …$/)
  })
})
