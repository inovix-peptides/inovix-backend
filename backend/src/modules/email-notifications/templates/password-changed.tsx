import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import type { EmailLocale } from '../../../lib/email-locale'
import { PASSWORD_CHANGED_I18N } from './email-i18n'

export const PASSWORD_CHANGED = 'password-changed'

export interface PasswordChangedEmailProps {
  actorType: 'customer' | 'user'
  changedAt: string
  supportEmail?: string
  locale?: EmailLocale
  preview?: string
}

export const isPasswordChangedData = (data: any): data is PasswordChangedEmailProps =>
  (data?.actorType === 'customer' || data?.actorType === 'user') &&
  typeof data?.changedAt === 'string' &&
  (typeof data?.supportEmail === 'string' || !data?.supportEmail) &&
  (typeof data?.preview === 'string' || !data?.preview)

// The admin (`user`) actor copy intentionally stays English and untranslated.
const userCopy = {
  heading: 'Password changed',
  intro: (when: string) =>
    `Your Inovix admin password was just changed at ${when}.`,
  warning: (support?: string) =>
    `Was this not you? Contact us immediately${
      support ? ` at ${support}` : ''
    } and change your password right away.`,
  defaultPreview: 'Your Inovix admin password was changed',
} as const

export const PasswordChangedEmail: React.FC<PasswordChangedEmailProps> & {
  PreviewProps: PasswordChangedEmailProps
} = ({ actorType, changedAt, supportEmail, locale = 'nl', preview }) => {
  const isCustomer = actorType === 'customer'
  const t = isCustomer
    ? (PASSWORD_CHANGED_I18N[locale] ?? PASSWORD_CHANGED_I18N.nl)
    : userCopy
  const showCustomerFooter = isCustomer
  return (
    <Base
      preview={preview ?? t.defaultPreview}
      showCustomerFooter={showCustomerFooter}
      {...(isCustomer ? { locale } : {})}
    >
      <Section className="mt-[24px] text-center">
        <Text className="text-black text-[18px] font-semibold leading-[28px] m-0">
          {t.heading}
        </Text>
      </Section>
      <Section>
        <Text className="text-black text-[14px] leading-[24px]">
          {t.intro(changedAt)}
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          {t.warning(supportEmail)}
        </Text>
      </Section>
    </Base>
  )
}

PasswordChangedEmail.PreviewProps = {
  actorType: 'customer',
  changedAt: '17 april 2026 om 14:32',
  supportEmail: 'support@inovix-peptides.nl',
} as PasswordChangedEmailProps

export default PasswordChangedEmail
