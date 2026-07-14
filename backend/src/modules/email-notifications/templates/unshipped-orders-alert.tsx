import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'

export const UNSHIPPED_ORDERS_ALERT = 'unshipped-orders-alert'

// Operator-facing alert (goes to info@inovix.nl, not to customers). Dutch, no
// customer footer, no locale switching.
export interface UnshippedOrdersAlertProps {
  orders: Array<{ display_id: string; customer_name: string; packed_at: string }>
  preview?: string
}

export const isUnshippedOrdersAlertData = (data: any): data is UnshippedOrdersAlertProps =>
  Array.isArray(data?.orders) &&
  data.orders.length > 0 &&
  data.orders.every(
    (o: any) =>
      typeof o?.display_id === 'string' &&
      typeof o?.customer_name === 'string' &&
      typeof o?.packed_at === 'string'
  )

export const UnshippedOrdersAlertTemplate: React.FC<UnshippedOrdersAlertProps> & {
  PreviewProps: UnshippedOrdersAlertProps
} = ({ orders, preview }) => (
  <Base
    preview={preview ?? 'Ingepakte bestellingen zijn nog niet verzonden'}
    showCustomerFooter={false}
  >
    <Section className="mt-[24px] text-center">
      <Text className="text-black text-[18px] font-semibold leading-[28px] m-0">
        Ingepakt maar nog niet verzonden
      </Text>
    </Section>
    <Section>
      <Text className="text-black text-[14px] leading-[24px]">
        Voor deze bestellingen is meer dan 24 uur geleden een DHL-label
        gemaakt, maar ze zijn nog niet gemarkeerd als verzonden. Controleer of
        het pakket echt is afgegeven en klik daarna op &quot;Markeer als
        verzonden &amp; mail klant&quot; op de bestelpagina. Zolang dat niet
        gebeurt, krijgt de klant geen track-and-trace mail.
      </Text>
      {orders.map((o) => (
        <Text key={o.display_id} className="text-black text-[14px] leading-[24px] m-0">
          Bestelling #{o.display_id} | {o.customer_name} | label gemaakt: {o.packed_at}
        </Text>
      ))}
    </Section>
  </Base>
)

UnshippedOrdersAlertTemplate.PreviewProps = {
  orders: [
    { display_id: '28411', customer_name: 'Jan Jansen', packed_at: '13 juli 2026' },
  ],
} as UnshippedOrdersAlertProps

export default UnshippedOrdersAlertTemplate
