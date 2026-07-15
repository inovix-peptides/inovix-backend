import { escapeHtml, eur, whenAms, orderGlyphs, headline, line } from '../format'

describe('format helpers', () => {
  it('escapes HTML special chars', () => {
    expect(escapeHtml('<b>&"x"</b>')).toBe('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;')
  })

  it('formats euros with two decimals', () => {
    expect(eur(89.9)).toBe('€89.90')
    expect(eur('12')).toBe('€12.00')
    expect(eur(null)).toBe('€0.00')
    expect(eur('not-a-number')).toBe('€0.00')
  })

  it('formats time in Europe/Amsterdam', () => {
    // 2026-07-14T12:32:00Z is 14:32 CEST
    expect(whenAms('2026-07-14T12:32:00Z')).toBe('14 Jul 14:32')
  })

  it('builds status glyphs', () => {
    expect(orderGlyphs({ paid: true, hasLabel: true, shipped: true, canceled: false })).toBe('✅📦🚚')
    expect(orderGlyphs({ paid: true, hasLabel: false, shipped: false, canceled: false })).toBe('✅')
    expect(orderGlyphs({ paid: false, hasLabel: false, shipped: false, canceled: true })).toBe('❌')
  })

  it('builds headline and labeled lines with escaping', () => {
    expect(headline('🛒', 'New order #1 <test>')).toBe('🛒 <b>New order #1 &lt;test&gt;</b>')
    expect(line('Country', 'NL & BE')).toBe('Country: NL &amp; BE')
  })
})
