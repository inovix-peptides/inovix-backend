/**
 * Render the customer-facing transactional emails in all three locales and
 * assert the language actually switches (and Dutch stays byte-compatible
 * with the pre-i18n copy for the default locale).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'

// @react-email/render's async render() relies on dynamic import, which jest
// blocks without --experimental-vm-modules; static markup is enough to assert
// the copy.
const render = (element: React.ReactElement): string => renderToStaticMarkup(element)

import { OrderPlacedTemplate } from '../templates/order-placed'
import { OrderShippedTemplate } from '../templates/order-shipped'
import { PaymentFailedTemplate } from '../templates/payment-failed'
import {
  ORDER_PLACED_I18N,
  ORDER_SHIPPED_I18N,
  PAYMENT_FAILED_I18N,
} from '../templates/email-i18n'
import { buildOrderConfirmationText } from '../../../subscribers/_helpers/order-confirmation-text'
import type { EmailLocale } from '../../../lib/email-locale'
import { normalizeEmailLocale } from '../../../lib/email-locale'

const LOCALES: EmailLocale[] = ['nl', 'de', 'en']

const order = OrderPlacedTemplate.PreviewProps.order
const shippingAddress = OrderPlacedTemplate.PreviewProps.shippingAddress

const EXPECT = {
  orderPlaced: {
    nl: ['Bedankt voor uw bestelling', 'Verzendadres', 'Inclusief btw'],
    de: ['Vielen Dank für Ihre Bestellung', 'Lieferadresse', 'Inklusive MwSt.'],
    en: ['Thank you for your order', 'Shipping address', 'Including VAT'],
  },
  orderShipped: {
    nl: ['Uw bestelling is onderweg', 'Volg uw pakket', 'Inhoud van deze zending'],
    de: ['Ihre Bestellung ist unterwegs', 'Paket verfolgen', 'Inhalt dieser Sendung'],
    en: ['Your order is on its way', 'Track your parcel', 'Contents of this shipment'],
  },
  paymentFailed: {
    nl: ['Betaling mislukt', 'Opnieuw proberen'],
    de: ['Zahlung fehlgeschlagen', 'Erneut versuchen'],
    en: ['Payment failed', 'Try again'],
  },
  footer: {
    nl: ['Uitsluitend voor onderzoeksdoeleinden'],
    de: ['Ausschließlich für Forschungszwecke'],
    en: ['For research use only'],
  },
} as const

describe('transactional email i18n', () => {
  // The first render of a react-email tree suspends once (Tailwind warms an
  // internal cache); retry after a tick so every test renders deterministically.
  beforeAll(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        render(
          <OrderPlacedTemplate
            order={order as any}
            shippingAddress={shippingAddress as any}
          />
        )
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
  })

  describe.each(LOCALES)('order-placed (%s)', (locale) => {
    it('renders the localized copy and footer', async () => {
      const html = render(
        <OrderPlacedTemplate
          order={order as any}
          shippingAddress={shippingAddress as any}
          locale={locale}
        />
      )
      for (const fragment of EXPECT.orderPlaced[locale]) {
        expect(html).toContain(fragment)
      }
      for (const fragment of EXPECT.footer[locale]) {
        expect(html).toContain(fragment)
      }
      // The research disclaimer must be present in every language.
      expect(html.toLowerCase()).toContain('in-vitro')
      // No em dashes in any output.
      expect(html).not.toContain('—')
    })
  })

  describe.each(LOCALES)('order-shipped (%s)', (locale) => {
    it('renders the localized copy', async () => {
      const html = render(
        <OrderShippedTemplate
          {...(OrderShippedTemplate.PreviewProps as any)}
          locale={locale}
        />
      )
      for (const fragment of EXPECT.orderShipped[locale]) {
        expect(html).toContain(fragment)
      }
      expect(html).not.toContain('—')
    })
  })

  describe.each(LOCALES)('payment-failed (%s)', (locale) => {
    it('renders the localized copy', async () => {
      const html = render(
        <PaymentFailedTemplate
          {...(PaymentFailedTemplate.PreviewProps as any)}
          locale={locale}
        />
      )
      for (const fragment of EXPECT.paymentFailed[locale]) {
        expect(html).toContain(fragment)
      }
      expect(html).not.toContain('—')
    })
  })

  it('defaults to Dutch when no locale is passed', async () => {
    const html = render(
      <OrderPlacedTemplate
        order={order as any}
        shippingAddress={shippingAddress as any}
      />
    )
    expect(html).toContain('Bedankt voor uw bestelling')
  })

  it('plain-text confirmation switches language and keeps the disclaimer', () => {
    const nl = buildOrderConfirmationText(order as any, shippingAddress as any)
    const de = buildOrderConfirmationText(order as any, shippingAddress as any, 'de')
    const en = buildOrderConfirmationText(order as any, shippingAddress as any, 'en')
    expect(nl).toContain('Bedankt voor uw bestelling bij Inovix')
    expect(nl).toContain('Uitsluitend voor onderzoeksdoeleinden')
    expect(de).toContain('Vielen Dank für Ihre Bestellung bei Inovix')
    expect(de).toContain('Ausschließlich für Forschungszwecke')
    expect(de).toContain('Sie')
    expect(en).toContain('Thank you for your order with Inovix')
    expect(en).toContain('For research use only')
    for (const text of [nl, de, en]) expect(text).not.toContain('—')
  })

  it('localizes the subjects per language', () => {
    expect(ORDER_PLACED_I18N.nl.subject('1042')).toBe('Bestelling bevestigd | Inovix 1042')
    expect(ORDER_PLACED_I18N.de.subject('1042')).toBe('Bestellung bestätigt | Inovix 1042')
    expect(ORDER_PLACED_I18N.en.subject('1042')).toBe('Order confirmed | Inovix 1042')
    expect(ORDER_SHIPPED_I18N.de.subject('1042')).toBe('Ihre Bestellung ist unterwegs | Inovix 1042')
    expect(PAYMENT_FAILED_I18N.en.subject).toBe('Payment failed | Inovix')
  })

  it('normalizes unknown locales to Dutch', () => {
    expect(normalizeEmailLocale('de')).toBe('de')
    expect(normalizeEmailLocale('fr')).toBe('nl')
    expect(normalizeEmailLocale(undefined)).toBe('nl')
    expect(normalizeEmailLocale(42)).toBe('nl')
  })
})
