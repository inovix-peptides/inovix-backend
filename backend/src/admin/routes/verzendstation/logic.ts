// Pure helpers for the Verzendstation page | no React, unit-testable.

export function formatAge(iso: string | null, nowMs: number): string {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ""
  const mins = Math.max(0, Math.floor((nowMs - t) / 60_000))
  if (mins < 60) return `${mins} min geleden`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} uur geleden`
  const days = Math.floor(hours / 24)
  return days === 1 ? "1 dag geleden" : `${days} dagen geleden`
}
