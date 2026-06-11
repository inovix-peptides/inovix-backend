import { Text, Section, Hr, Button } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import type { EmailLocale } from '../../../lib/email-locale'
import { CUSTOMER_WELCOME_I18N } from './email-i18n'

export const CUSTOMER_WELCOME = 'customer-welcome'

export interface CustomerWelcomeTemplateProps {
  firstName?: string | null
  email: string
  storefrontUrl: string
  locale?: EmailLocale
  preview?: string
}

export const isCustomerWelcomeData = (
  data: any
): data is CustomerWelcomeTemplateProps =>
  typeof data.email === 'string' && typeof data.storefrontUrl === 'string'

export const CustomerWelcomeTemplate: React.FC<CustomerWelcomeTemplateProps> & {
  PreviewProps: CustomerWelcomeTemplateProps
} = ({ firstName, email, storefrontUrl, locale = 'nl', preview }) => {
  const t = CUSTOMER_WELCOME_I18N[locale] ?? CUSTOMER_WELCOME_I18N.nl
  const greetingName = firstName?.trim() || email
  const accountUrl = `${storefrontUrl}/account`
  const productsUrl = `${storefrontUrl}/products`

  return (
    <Base preview={preview ?? t.preview} locale={locale}>
      <Section className="mt-[24px] text-center">
        <Text className="text-black text-[18px] font-semibold leading-[28px] m-0">
          {t.heading}
        </Text>
      </Section>

      <Section className="mt-[24px]">
        <Text className="text-black text-[14px] leading-[22px] m-0">
          {t.greeting} {greetingName},
        </Text>
        <Text className="text-black text-[14px] leading-[22px] mt-[12px]">
          {t.body}
        </Text>
      </Section>

      <Hr className="border border-solid border-[#eaeaea] my-[20px] mx-0 w-full" />

      <Section>
        <Text className="text-black text-[13px] font-semibold uppercase tracking-wide m-0 mb-[8px]">
          {t.howToOrder}
        </Text>
        <Text className="text-black text-[13px] leading-[20px] m-0">
          {t.step1}
        </Text>
        <Text className="text-black text-[13px] leading-[20px] m-0">
          {t.step2}
        </Text>
        <Text className="text-black text-[13px] leading-[20px] m-0">
          {t.step3}
        </Text>
        <Text className="text-black text-[13px] leading-[20px] mt-[8px]">
          {t.shippingNote}
        </Text>
      </Section>

      <Section className="mt-[24px] text-center">
        <Button
          href={productsUrl}
          className="bg-black text-white text-[13px] font-semibold no-underline px-[20px] py-[12px]"
        >
          {t.browseButton}
        </Button>
      </Section>

      <Hr className="border border-solid border-[#eaeaea] my-[20px] mx-0 w-full" />

      <Section>
        <Text className="text-[#666666] text-[12px] leading-[18px] m-0">
          {t.accountNotePre}
          <a href={accountUrl} className="text-[#666666] underline">
            {accountUrl.replace(/^https?:\/\//, '')}
          </a>
          {t.accountNotePost}
        </Text>
      </Section>
    </Base>
  )
}

CustomerWelcomeTemplate.PreviewProps = {
  firstName: 'Jan',
  email: 'jan@example.com',
  storefrontUrl: 'https://inovix-peptides.nl',
}

export default CustomerWelcomeTemplate
