export function helpText(): string {
  return [
    '<b>Inovix Ops</b>',
    '',
    '/todo | orders needing action',
    '/station | verzendstation queues (process / ship)',
    '/orders [n] | recent orders',
    '/order &lt;number&gt; | order detail + action buttons',
    '/stock [search] | inventory levels',
    '/restock &lt;search&gt; +&lt;n&gt; | add stock (with confirm)',
    '/find &lt;text&gt; | product search',
    '/sales [today|week|month] | revenue',
    '/top [week|month] | best sellers',
    '/customer &lt;email or name&gt; | order history + lifetime value',
    '/digest | the daily digest on demand',
    '/log [n] | recent bot actions',
    '/help | this overview',
  ].join('\n')
}
