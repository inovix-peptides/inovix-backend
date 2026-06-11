import { Text, Section, Hr, Button } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import type { EmailLocale } from '../../../lib/email-locale'
import { PAYMENT_FAILED_I18N } from './email-i18n'

export const PAYMENT_FAILED = 'payment-failed'

export interface PaymentFailedProps {
  customerName?: string | null
  amountFormatted: string
  currency: string
  retryUrl: string
  locale?: EmailLocale
  preview?: string
}

export const isPaymentFailedData = (data: any): data is PaymentFailedProps =>
  typeof data?.amountFormatted === 'string' &&
  typeof data?.currency === 'string' &&
  typeof data?.retryUrl === 'string'

export const PaymentFailedTemplate: React.FC<PaymentFailedProps> & {
  PreviewProps: PaymentFailedProps
} = ({
  customerName,
  amountFormatted,
  currency,
  retryUrl,
  locale = 'nl',
  preview,
}) => {
  const t = PAYMENT_FAILED_I18N[locale] ?? PAYMENT_FAILED_I18N.nl
  const greetingName = customerName?.trim() || t.greetingFallback

  return (
    <Base preview={preview ?? t.preview} locale={locale}>
      <Section className="mt-[24px] text-center">
        <Text className="text-black text-[18px] font-semibold leading-[28px] m-0">
          {t.heading}
        </Text>
        <Text className="text-[#666666] text-[12px] leading-[20px] mt-[4px] mb-0">
          {t.subheading}
        </Text>
      </Section>

      <Section className="mt-[24px]">
        <Text className="text-black text-[14px] leading-[22px] m-0">
          {t.greeting} {greetingName},
        </Text>
        <Text className="text-black text-[14px] leading-[22px] mt-[12px]">
          {t.bodyPre}
          <strong>{amountFormatted} {currency.toUpperCase()}</strong>
          {t.bodyPost}
        </Text>
        <Text className="text-black text-[14px] leading-[22px] mt-[12px]">
          {t.cartReady}
        </Text>
      </Section>

      <Section className="mt-[24px] text-center">
        <Button
          href={retryUrl}
          className="bg-black text-white text-[14px] font-semibold no-underline px-[20px] py-[12px]"
        >
          {t.retryButton}
        </Button>
      </Section>

      <Hr className="border border-solid border-[#eaeaea] my-[24px] mx-0 w-full" />

      <Section>
        <Text className="text-[#666666] text-[12px] leading-[20px] m-0">
          {t.helpLine}
        </Text>
      </Section>
    </Base>
  )
}

PaymentFailedTemplate.PreviewProps = {
  customerName: 'Jan de Vries',
  amountFormatted: '150,00',
  currency: 'EUR',
  retryUrl: 'https://inovix-peptides.nl/winkelwagen',
} as PaymentFailedProps

export default PaymentFailedTemplate
