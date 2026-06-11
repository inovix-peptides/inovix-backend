import crypto from 'crypto'
import OpenAI from 'openai'
import { OPENAI_API_KEY, OPENAI_MODEL } from './constants'

// Languages we generate. The prose fields (description/subtitle/
// long_description/category) are authored in Dutch, so they translate into
// de/en (TARGET_LANGS). The spec/storage fields (FOREIGN_SOURCE_KEYS) were
// authored in English, so translateAll also generates a Dutch rendering for
// them | hence 'nl' is a valid target. The English DB value is never
// overwritten; the storefront just reads i18n.nl for those fields.
export type TargetLang = 'nl' | 'de' | 'en'
export const TARGET_LANGS: TargetLang[] = ['de', 'en']

export interface TranslatableFields {
  description?: string | null
  subtitle?: string | null
  long_description?: string | null // HTML (rich description from metadata)
  category?: string | null
  physical_state?: string | null
  solubility?: string | null
  shelf_life?: string | null
  storage_temp?: string | null
  handling_notes?: string | null
}

const FIELD_KEYS = [
  'description',
  'subtitle',
  'long_description',
  'category',
  'physical_state',
  'solubility',
  'shelf_life',
  'storage_temp',
  'handling_notes',
] as const

// Spec/storage fields authored in English. translateAll generates Dutch for
// these (in addition to de/en) so the Dutch storefront does not show English.
const FOREIGN_SOURCE_KEYS = [
  'physical_state',
  'solubility',
  'shelf_life',
  'storage_temp',
  'handling_notes',
] as const

// Per-field character caps. A field over its cap is skipped (the storefront
// falls back to the source for it) so a runaway paste can never produce an
// unbounded token bill. long_description is HTML and can legitimately be long,
// hence the larger budget; handling_notes is multi-paragraph prose.
const FIELD_LIMITS: Record<(typeof FIELD_KEYS)[number], number> = {
  description: 4_000,
  subtitle: 1_000,
  category: 200,
  long_description: 24_000,
  physical_state: 600,
  solubility: 300,
  shelf_life: 400,
  storage_temp: 200,
  handling_notes: 4_000,
}

// Hard ceiling on generated tokens per call (bounds cost + latency).
const MAX_OUTPUT_TOKENS = 8_000

const LANG_LABEL: Record<TargetLang, string> = {
  nl: 'Dutch (Nederlands)',
  de: "German (Deutsch), using the formal 'Sie' register",
  en: 'English',
}

let client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (!OPENAI_API_KEY) return null
  if (!client) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 })
  }
  return client
}

/** True when an API key is present, so callers can no-op cleanly otherwise. */
export function translationConfigured(): boolean {
  return Boolean(OPENAI_API_KEY)
}

// A stable hash of the Dutch source fields. The subscriber compares this against
// the last-translated hash so it only re-translates when the source actually
// changed (and so writing the translations back does not loop).
export function hashSource(source: TranslatableFields): string {
  const norm = JSON.stringify({
    d: source.description ?? '',
    s: source.subtitle ?? '',
    l: source.long_description ?? '',
    c: source.category ?? '',
    ps: source.physical_state ?? '',
    so: source.solubility ?? '',
    sl: source.shelf_life ?? '',
    st: source.storage_temp ?? '',
    hn: source.handling_notes ?? '',
  })
  return crypto.createHash('sha256').update(norm).digest('hex')
}

const SYSTEM_PROMPT = `You are a professional translator for an EU e-commerce store that sells research peptides for laboratory use. The source fields may be in Dutch or English. Translate the given product fields into {LANG}.

Rules:
- Translate ONLY natural-language prose. Keep these UNCHANGED in every field: the brand name "Inovix"; product and peptide names and codes (for example BPC-157, TB-500, GLP-1, GHK-Cu, Semaglutide); scientific abbreviations (HPLC, LC-MS, GC-MS, GMP, GLP, CoA, RUO, MS, SPPS); chemical formulas; CAS numbers; temperatures, units and numbers.
- "long_description" is HTML. Preserve ALL HTML tags, attributes and structure EXACTLY; translate only the human-readable text between the tags. Do not add, remove, or reorder tags.
- Keep a professional, scientific tone. For German use the formal "Sie".
- Keep the research-use meaning intact. Do not add disclaimers, notes, or commentary.
- Do not use em dashes; use commas, colons, or "|".
- Respond with a JSON object containing exactly the same keys you received, each holding the translated value.`

/**
 * Translate the non-empty fields of `source` into `lang`. Returns only the
 * fields that were present in the input. Throws if no API key is configured.
 */
export async function translateFields(
  source: TranslatableFields,
  lang: TargetLang
): Promise<TranslatableFields> {
  const api = getClient()
  if (!api) throw new Error('OPENAI_API_KEY not configured')

  const payload: Record<string, string> = {}
  for (const key of FIELD_KEYS) {
    const value = source[key]
    // Skip empty fields and anything over its cap (caps the token cost; an
    // oversized field just falls back to the Dutch source on the storefront).
    if (typeof value === 'string' && value.trim() && value.length <= FIELD_LIMITS[key]) {
      payload[key] = value
    }
  }
  if (Object.keys(payload).length === 0) return {}

  const completion = await api.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT.replace('{LANG}', LANG_LABEL[lang]) },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    parsed = {}
  }

  const out: TranslatableFields = {}
  for (const key of FIELD_KEYS) {
    const value = parsed[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/**
 * Translate into every rendered language. Returns { nl, de, en }.
 * - de/en get every present field (prose is Dutch -> de/en; spec is English ->
 *   de/en).
 * - nl is generated ONLY for the English-authored spec fields
 *   (FOREIGN_SOURCE_KEYS); the prose fields are already Dutch in the DB, so the
 *   storefront falls back to the source for them on nl.
 */
export async function translateAll(
  source: TranslatableFields
): Promise<Record<TargetLang, TranslatableFields>> {
  const foreignSource: TranslatableFields = {}
  for (const key of FOREIGN_SOURCE_KEYS) {
    if (source[key] != null) foreignSource[key] = source[key]
  }

  const [de, en, nl] = await Promise.all([
    translateFields(source, 'de'),
    translateFields(source, 'en'),
    translateFields(foreignSource, 'nl'),
  ])

  return { nl, de, en }
}
