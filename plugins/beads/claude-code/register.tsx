import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  ProcessRunInit,
  ProcessRunResult,
  Register,
  RenderElement,
} from 'claude-code'

import type { BeadsState } from './types'
import {
  type Bead,
  countMemories,
  estimateTokens,
  formatTokens,
  parseBeads,
  summariseBeads,
} from './beads'

// Events fill this and the band only reads it, so drawing runs no commands.
const beads = atom({ plugin: 'beads', key: 'beads' } as const, null)

const TITLE_CHARS = 40

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// A command's result, or null when it could not run at all: not installed,
// past its timeout, or a session that runs no commands. Every case reads as
// "nothing to show", never as a failed hook.
const run = async (
  $: EngineInterface,
  argv: string[],
  init: ProcessRunInit,
): Promise<ProcessRunResult | null> => {
  try {
    return await $.process.run(argv, init)
  } catch {
    return null
  }
}

const bd = async ($: EngineInterface, args: string[]): Promise<Bead[] | undefined> => {
  const ran = await run($, ['bd', ...args, '--brief', '--json'], { timeoutMs: 10_000 })

  return ran?.exitCode === 0 ? parseBeads(ran.stdout) : undefined
}

const memoryCount = async ($: EngineInterface): Promise<number | undefined> => {
  const ran = await run($, ['bd', 'memories', '--json'], { timeoutMs: 10_000 })

  return ran?.exitCode === 0 ? countMemories(ran.stdout) : undefined
}

// What a session-start hook running `bd prime` adds to the context.
const primeTokens = async ($: EngineInterface): Promise<number | undefined> => {
  const ran = await run($, ['bd', 'prime'], { timeoutMs: 10_000 })

  return ran?.exitCode === 0 && ran.stdout.length > 0 ? estimateTokens(ran.stdout) : undefined
}

// bd takes a few tenths of a second per call, so this is never waited on.
const refreshBeads = async ($: EngineInterface) => {
  const [inProgress, ready, deferred, memories, prime] = await Promise.all([
    bd($, ['list', '--status', 'in_progress']),
    bd($, ['ready', '--limit', '0']),
    bd($, ['list', '--deferred']),
    memoryCount($),
    primeTokens($),
  ])
  const next: BeadsState | null =
    inProgress === undefined || ready === undefined
      ? null
      : summariseBeads(
          inProgress,
          ready.length,
          deferred ?? [],
          await $.clock.now(),
          memories,
          prime,
        )

  await update($, beads, prev => (same(prev, next) ? (prev ?? null) : next))
}

const RUNS_BD = /(^|[\s;&|(])bd\s/

// The band's rows, shared by the mods that draw in it. Each keys its row
// `band:<rank>:<name>`, takes the rows the mods beneath it drew and puts its
// own among them by rank, so the rows keep one order whichever mod the engine
// asks first. Anything else beneath (another mod's tree) goes after them.
const BAND_KEY = 'band-rows'

const keyOf = (element: unknown): string => {
  const key = (element as { props?: { key?: unknown } } | null)?.props?.key

  return typeof key === 'string' ? key : ''
}

const stack = (above: RenderElement, row: RenderElement): RenderElement[] => {
  const beneath =
    keyOf(above) === BAND_KEY
      ? (((above as { children?: unknown[] }).children ?? []) as RenderElement[])
      : [above]
  const rows = [...beneath.filter(e => keyOf(e).startsWith('band:')), row].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b)),
  )

  return [...rows, ...beneath.filter(e => !keyOf(e).startsWith('band:'))]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void refreshBeads($)

    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)

    if (RUNS_BD.test(e.command)) {
      void refreshBeads($)
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      void refreshBeads($)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, beads)

    if (e.props.hasSurvey || b === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    const row = (
      <Box key="band:30:beads">
        <Text wrap="truncate">
          {b.latest === undefined ? null : (
            <Text>
              <Text color="cyan">◆ {b.latest.id}</Text>
              <Text dimColor> {truncate(b.latest.title, TITLE_CHARS)}</Text>
              {b.others > 0 ? <Text dimColor> (+{b.others})</Text> : null}
              <Text dimColor> · </Text>
            </Text>
          )}
          <Text>{b.ready} ready</Text>
          {b.due > 0 ? <Text color="yellow"> · {b.due} deferred due</Text> : null}
          {b.memories === undefined ? null : (
            <Text dimColor>
              {' · '}
              {b.memories} {b.memories === 1 ? 'memory' : 'memories'}
            </Text>
          )}
          {b.primeTokens === undefined ? null : (
            <Text dimColor> · prime ~{formatTokens(b.primeTokens)} tokens</Text>
          )}
        </Text>
      </Box>
    )

    return (
      <Box key={BAND_KEY} flexDirection="column">
        {stack(await next(e), row)}
      </Box>
    )
  })
}
