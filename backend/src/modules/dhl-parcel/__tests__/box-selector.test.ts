import { sumOrderWeightGrams, suggestBoxPreset } from '../box-selector'

describe('sumOrderWeightGrams', () => {
  it('returns 0 for an empty items array', () => {
    expect(sumOrderWeightGrams([])).toBe(0)
  })

  it('returns quantity * weight for a single item', () => {
    expect(
      sumOrderWeightGrams([{ quantity: 1, product: { weight: 50 } }])
    ).toBe(50)
  })

  it('sums quantity * weight across multiple items', () => {
    expect(
      sumOrderWeightGrams([
        { quantity: 2, product: { weight: 50 } },
        { quantity: 3, product: { weight: 10 } },
      ])
    ).toBe(130)
  })

  it('throws when an item has product.weight null', () => {
    expect(() =>
      sumOrderWeightGrams([{ quantity: 1, product: { weight: null } }])
    ).toThrow('Cannot compute shipment weight: an order item is missing a product weight')
  })

  it('throws when an item has product undefined', () => {
    expect(() =>
      sumOrderWeightGrams([{ quantity: 1, product: undefined }])
    ).toThrow('Cannot compute shipment weight: an order item is missing a product weight')
  })
})

describe('suggestBoxPreset', () => {
  const presets = [
    { parcel_type_key: 'SMALL', max_items: 2, name: 'Small Box' },
    { parcel_type_key: 'MEDIUM', max_items: 5, name: 'Medium Box' },
    { parcel_type_key: 'LARGE', max_items: 10, name: 'Large Box' },
  ]

  it('picks the smallest preset whose max_items >= totalUnits, with overflow false', () => {
    const result = suggestBoxPreset(presets, 4)
    expect(result.overflow).toBe(false)
    expect(result.preset.parcel_type_key).toBe('MEDIUM')
    expect(result.preset.name).toBe('Medium Box')
    expect(result.preset.max_items).toBe(5)
  })

  it('returns the largest preset with overflow true when totalUnits exceeds all max_items', () => {
    const result = suggestBoxPreset(presets, 15)
    expect(result.overflow).toBe(true)
    expect(result.preset.parcel_type_key).toBe('LARGE')
    expect(result.preset.max_items).toBe(10)
  })

  it('throws when presets array is empty', () => {
    expect(() => suggestBoxPreset([], 3)).toThrow(
      'Cannot select a box preset: no presets provided'
    )
  })

  it('picks the exact-match preset when totalUnits equals max_items exactly', () => {
    const result = suggestBoxPreset(presets, 5)
    expect(result.overflow).toBe(false)
    expect(result.preset.parcel_type_key).toBe('MEDIUM')
  })

  it('picks the smallest (first in list) preset when totalUnits fits within the smallest', () => {
    const result = suggestBoxPreset(presets, 1)
    expect(result.overflow).toBe(false)
    expect(result.preset.parcel_type_key).toBe('SMALL')
    expect(result.preset.max_items).toBe(2)
  })
})
