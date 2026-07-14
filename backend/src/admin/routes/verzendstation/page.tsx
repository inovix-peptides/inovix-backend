import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { formatAge } from "./logic"

// The warehouse PC's homepage: only the orders that need action, as large
// tap-friendly rows. Clicking a row opens the order page, where the
// fulfillment checklist widget sits on top and walks the fulfiller through
// the steps. Auto-refreshes every 60s.

type QueueEntry = {
  id: string
  display_id: number | null
  customer_name: string
  item_count: number
  created_at: string | null
  packed_at: string | null
}

type Queues = {
  to_process: QueueEntry[]
  to_ship: QueueEntry[]
}

const REFRESH_MS = 60_000

function OrderRow({ entry, ageLabel }: { entry: QueueEntry; ageLabel: string }) {
  return (
    <Link
      to={`/orders/${entry.id}`}
      className="block border border-ui-border-base bg-ui-bg-base px-4 py-3 hover:bg-ui-bg-base-hover"
      style={{ textDecoration: "none" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Text size="large" weight="plus">
            #{entry.display_id ?? "?"} | {entry.customer_name || "Onbekende klant"}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {entry.item_count} {entry.item_count === 1 ? "item" : "items"}
          </Text>
        </div>
        <Text size="small" className="text-ui-fg-subtle whitespace-nowrap">
          {ageLabel}
        </Text>
      </div>
    </Link>
  )
}

function QueueColumn({
  title,
  subtitle,
  entries,
  emptyLabel,
  ageOf,
  urgent,
}: {
  title: string
  subtitle: string
  entries: QueueEntry[]
  emptyLabel: string
  ageOf: (e: QueueEntry) => string
  urgent?: boolean
}) {
  return (
    <Container className="p-0">
      <div
        className="px-4 py-3"
        style={
          urgent && entries.length > 0
            ? { borderBottom: "1px solid #fcd34d", background: "#fffbeb" }
            : { borderBottom: "1px solid var(--border-base, #e5e7eb)" }
        }
      >
        <Heading level="h2">
          {title} ({entries.length})
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {subtitle}
        </Text>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {entries.length === 0 ? (
          <Text size="small" className="text-ui-fg-muted">
            {emptyLabel}
          </Text>
        ) : (
          entries.map((e) => <OrderRow key={e.id} entry={e} ageLabel={ageOf(e)} />)
        )}
      </div>
    </Container>
  )
}

const VerzendstationPage = () => {
  const [queues, setQueues] = useState<Queues | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  async function load() {
    try {
      const res = await fetch("/admin/verzendstation/queue", { credentials: "include" })
      if (!res.ok) throw new Error(`Laden mislukt (${res.status})`)
      setQueues((await res.json()) as Queues)
      setError(null)
      setUpdatedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout")
    }
  }

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const now = updatedAt ?? Date.now()

  return (
    <div className="flex flex-col gap-4">
      <Container className="p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h1">Verzendstation</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Alle bestellingen die actie nodig hebben. Klik op een bestelling en
              volg de verzendchecklist bovenaan de pagina. Ververst elke minuut.
            </Text>
          </div>
          {error ? (
            <Text size="small" className="text-ui-fg-error">
              {error}
            </Text>
          ) : null}
        </div>
      </Container>

      {queues === null && !error ? (
        <Container className="p-6">
          <Text size="small" className="text-ui-fg-subtle">
            Laden...
          </Text>
        </Container>
      ) : queues ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QueueColumn
            title="Te verwerken"
            subtitle="Betaald, nog geen DHL-label"
            entries={queues.to_process}
            emptyLabel="Niets te verwerken. Goed bezig!"
            ageOf={(e) => (e.created_at ? `${formatAge(e.created_at, now)} besteld` : "")}
          />
          <QueueColumn
            title="Ingepakt, nog niet verzonden"
            subtitle="Label gemaakt, maar nog niet gemarkeerd als verzonden"
            entries={queues.to_ship}
            emptyLabel="Alles is verzonden."
            ageOf={(e) => (e.packed_at ? `label ${formatAge(e.packed_at, now)}` : "")}
            urgent
          />
        </div>
      ) : null}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Verzendstation",
  icon: TruckFast,
})

export default VerzendstationPage
