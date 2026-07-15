export function helpText(): string {
  return [
    '<b>Inovix Ops</b>',
    '',
    '/todo | orders needing action',
    '/orders [n] | recent orders',
    '/order &lt;number&gt; | order detail',
    '/stock [search] | inventory levels',
    '/find &lt;text&gt; | product search',
    '/sales [today|week|month] | revenue',
    '/help | this overview',
  ].join('\n')
}
