import type { BeadsState } from './types'

export type Bead = { id: string; title: string; updated_at?: string; defer_until?: string }

// A bd command's JSON output as rows, or undefined when it is not a list.
export const parseBeads = (stdout: string): Bead[] | undefined => {
  try {
    const rows: unknown = JSON.parse(stdout)

    return Array.isArray(rows) ? (rows as Bead[]) : undefined
  } catch {
    return undefined
  }
}

export const summariseBeads = (
  inProgress: Bead[],
  ready: number,
  deferred: Bead[],
  now: number,
): BeadsState => {
  const latest = [...inProgress].sort((a, b) =>
    (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
  )[0]

  return {
    latest: latest === undefined ? undefined : { id: latest.id, title: latest.title },
    others: Math.max(0, inProgress.length - 1),
    ready,
    due: deferred.filter(b => b.defer_until !== undefined && Date.parse(b.defer_until) <= now)
      .length,
  }
}
