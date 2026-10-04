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

// How many memories `bd memories --json` lists, or undefined when the output
// is not an object keyed by memory name. Each memory's value is its text; the
// object also carries metadata such as `schema_version`, which is not a
// memory, so only string values count.
export const countMemories = (stdout: string): number | undefined => {
  try {
    const memories: unknown = JSON.parse(stdout)

    return memories !== null && typeof memories === 'object' && !Array.isArray(memories)
      ? Object.values(memories).filter((value) => typeof value === 'string').length
      : undefined
  } catch {
    return undefined
  }
}

// A rough token count for text, at about four characters a token: close
// enough to tell a lean `bd prime` from one that crowds the context.
export const estimateTokens = (text: string): number => Math.round(text.length / 4)

export const formatTokens = (tokens: number): string =>
  tokens < 1000 ? `${tokens}` : `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`

export const summariseBeads = (
  inProgress: Bead[],
  ready: number,
  deferred: Bead[],
  now: number,
  memories?: number,
  primeTokens?: number,
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
    memories,
    primeTokens,
  }
}
