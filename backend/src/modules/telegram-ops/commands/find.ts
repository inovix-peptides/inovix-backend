import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { escapeHtml } from '../format'
import type { CommandHandler } from './router'

type Prod = { id: string; title: string; status: string; variants?: Array<{ sku?: string | null; title?: string | null }> }

export const findCommand: CommandHandler = async ({ container, args }) => {
  const search = args.join(' ').toLowerCase()
  if (!search) return 'Usage: /find &lt;text&gt;, e.g. /find reta'
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'product',
    fields: ['id', 'title', 'status', 'variants.sku', 'variants.title'],
  })
  const hits = ((data ?? []) as Prod[]).filter((p) =>
    `${p.title} ${(p.variants ?? []).map((v) => v?.sku).join(' ')}`.toLowerCase().includes(search)
  ).slice(0, 10)
  if (!hits.length) return `No products match "${escapeHtml(search)}".`
  const lines = hits.map((p) => {
    const variants = (p.variants ?? []).map((v) => v?.title || v?.sku).filter(Boolean).join(', ')
    return `${escapeHtml(p.title)} [${p.status}]${variants ? ` | ${escapeHtml(variants)}` : ''}`
  })
  return [`<b>Products | ${escapeHtml(search)}</b>`, '', ...lines, '', 'Stock: /stock &lt;term&gt;'].join('\n')
}
