import { Button, Link, Section, Text } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import type { EmailLocale } from '../../../lib/email-locale'
import { PASSWORD_RESET_I18N } from './email-i18n'

export const PASSWORD_RESET = 'password-reset'

export interface PasswordResetEmailProps {
  resetLink: string
  actorType: 'customer' | 'user'
  locale?: EmailLocale
  preview?: string
}

export const isPasswordResetData = (data: any): data is PasswordResetEmailProps =>
  typeof data?.resetLink === 'string' &&
  (data?.actorType === 'customer' || data?.actorType === 'user') &&
  (typeof data?.preview === 'string' || !data?.preview)

// The admin (`user`) actor copy intentionally stays English and untranslated.
const userCopy = {
  heading: 'Reset your password',
  intro: 'A request was made to reset the password on your Inovix admin account.',
  instruction:
    'Click the button below to set a new password. This link expires in 15 minutes.',
  button: 'Set new password',
  fallback: 'Or copy and paste this URL into your browser:',
  ignore:
    "Didn't request a password reset? You can ignore this email, your password will remain unchanged.",
  defaultPreview: 'Reset your Inovix admin password',
} as const

export const PasswordResetEmail: React.FC<PasswordResetEmailProps> & {
  PreviewProps: PasswordResetEmailProps
} = ({ resetLink, actorType, locale = 'nl', preview }) => {
  const isCustomer = actorType === 'customer'
  const t = isCustomer
    ? (PASSWORD_RESET_I18N[locale] ?? PASSWORD_RESET_I18N.nl)
    : userCopy
  return (
    <Base
      preview={preview ?? t.defaultPreview}
      {...(isCustomer ? { locale } : {})}
    >
      <Section className="mt-[24px] text-center">
        <Text className="text-black text-[18px] font-semibold leading-[28px] m-0">
          {t.heading}
        </Text>
      </Section>
      <Section>
        <Text className="text-black text-[14px] leading-[24px]">{t.intro}</Text>
        <Text className="text-black text-[14px] leading-[24px]">
          {t.instruction}
        </Text>
      </Section>
      <Section className="text-center mt-4 mb-[32px]">
        <Button
          className="bg-[#000000] text-white text-[12px] font-semibold no-underline px-5 py-3"
          href={resetLink}
        >
          {t.button}
        </Button>
      </Section>
      <Section>
        <Text className="text-black text-[14px] leading-[24px]">{t.fallback}</Text>
        <Text
          style={{
            maxWidth: '100%',
            wordBreak: 'break-all',
            overflowWrap: 'break-word',
          }}
        >
          <Link href={resetLink} className="text-blue-600 no-underline">
            {resetLink}
          </Link>
        </Text>
      </Section>
      <Section>
        <Text className="text-[#666666] text-[12px] leading-[20px]">{t.ignore}</Text>
      </Section>
    </Base>
  )
}

PasswordResetEmail.PreviewProps = {
  resetLink:
    'https://inovix.example/account/wachtwoord-herstellen?token=abc123xyzxyzxyzxyzxyzxyzxyzxyz&email=klant@voorbeeld.nl',
  actorType: 'customer',
} as PasswordResetEmailProps

export default PasswordResetEmail
