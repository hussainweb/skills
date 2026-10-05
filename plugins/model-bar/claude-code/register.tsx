import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer, TurnUsage } from 'claude-code'

import type { Bar } from './types'

// Everything the band shows. Events fill it and the band only reads it, so
// drawing costs no host calls and nothing redraws unless a figure changed.
const bar = atom({ plugin: 'model-bar', key: 'bar' } as const, null)

const MODELS = [
  { alias: 'opus' },
  { alias: 'sonnet' },
  { alias: 'fable' },
  { alias: 'haiku' },
] as const

const LIMIT_LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const

const BAR_CELLS = 10

const currentAlias = (model: string): string | undefined => {
  const name = model.toLowerCase()

  return MODELS.find(m => name.includes(m.alias))?.alias
}

// `claude-opus-5-5` reads as `opus 5.5`; anything else is shown as given.
const displayName = (model: string): string => {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)

  return match ? `${match[1]} ${match[2]}.${match[3]}` : model
}

const contextBar = (percent: number): string => {
  const filled = Math.min(BAR_CELLS, Math.round((percent / 100) * BAR_CELLS))

  return '▓'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

const compactTokens = (n: number): string =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}k`
      : `${n}`

const clockTime = (ms: number): string => {
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const levelColor = (percent: number): string =>
  percent >= 80 ? 'red' : percent >= 50 ? 'yellow' : 'green'

const hitPercent = (usage: TurnUsage): number | undefined => {
  const total =
    usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

  return total > 0 ? Math.round((usage.cache_read_input_tokens / total) * 100) : undefined
}

// Module state: lost on reload, which is fine, since a reload drops the
// previous environment's timers too.
let ttlMs: number = TTL_MS['1h']
let expiry: Timer | undefined

// Writes only when something the band shows changed.
const merge = ($: EngineInterface, patch: Partial<Bar>) =>
  update($, bar, prev => {
    const next: Bar = {
      model: '',
      contextWindow: 0,
      limits: [],
      isCacheCold: true,
      ...prev,
      ...patch,
    }

    return JSON.stringify(next) === JSON.stringify(prev) ? (prev as Bar) : next
  })

// Reads the figures the host already holds; no breakdown, so no counting.
const refresh = async ($: EngineInterface) => {
  const model = await $.session.model()
  const usage = await $.session.usage()

  await merge($, {
    model,
    contextPercent: usage.context.percent,
    contextTokens: usage.context.tokens,
    contextWindow: usage.context.window,
    limits: usage.rateLimits
      .filter(l => l.kind in LIMIT_LABELS)
      .map(l => ({ kind: l.kind, percentUsed: Math.round(l.percentUsed) })),
    costUsd: usage.cost === undefined ? undefined : Math.round(usage.cost.usd * 100) / 100,
  })
}

// One pending wakeup at most: the moment the cache lapses.
const armExpiry = async ($: EngineInterface) => {
  expiry?.cancel()
  const warmUntil = (await $.clock.now()) + ttlMs
  await merge($, { cacheWarmUntil: warmUntil, isCacheCold: false })
  expiry = $.clock.after(ttlMs, () => {
    void merge($, { isCacheCold: true })
  })
}

// What the band can leave out when the row is too wide, least useful first.
type Show = {
  cost: boolean
  bar: boolean
  tokens: boolean
  until: boolean
  allLimits: boolean
}

const DROP_ORDER: (keyof Show)[] = ['bar', 'cost', 'tokens', 'until', 'allLimits']

// The band's text, segment by segment, so that measuring and drawing agree.
const texts = (state: Bar, show: Show) => {
  const percent = state.contextPercent
  const limits = state.limits
    .filter(l => show.allLimits || l.kind === 'five_hour')
    .map(l => {
      const label = LIMIT_LABELS[l.kind] ?? l.kind
      const percentText = `${l.percentUsed}%`

      return { ...l, label, percentText, text: `${label} ${percentText}` }
    })
  const hasCache = state.cacheWarmUntil !== undefined || state.cacheHitPercent !== undefined
  const cacheParts = [
    'cache',
    state.cacheHitPercent === undefined ? '' : `${state.cacheHitPercent}% hit`,
    show.until && state.cacheWarmUntil !== undefined
      ? `until ${clockTime(state.cacheWarmUntil)}`
      : '',
  ].filter(part => part !== '')

  return {
    model: displayName(state.model),
    contextFill:
      percent === undefined ? '–' : `${show.bar ? `${contextBar(percent)} ` : ''}${percent}%`,
    contextTokens:
      show.tokens && state.contextTokens !== undefined
        ? `${compactTokens(state.contextTokens)}/${compactTokens(state.contextWindow)}`
        : '',
    cache: !hasCache ? undefined : state.isCacheCold ? 'cache cold' : cacheParts.join(' '),
    limits,
    cost: state.costUsd === undefined ? undefined : `$${state.costUsd.toFixed(2)}`,
  }
}

const SEPARATOR_WIDTH = 3 // ' │ '

// What the terminal draws around a Select's value at rest; an estimate.
const SELECT_CHROME = 4

// Columns kept free so a measuring slip shortens the row instead of wrapping it.
const SLACK = 2

const widthOf = (state: Bar, show: Show): number => {
  const t = texts(state, show)
  const segments = [
    t.model.length + SELECT_CHROME,
    4 + t.contextFill.length + (t.contextTokens === '' ? 0 : 1 + t.contextTokens.length),
  ]

  if (t.cache !== undefined) {
    segments.push(t.cache.length)
  }
  if (t.limits.length > 0) {
    segments.push(t.limits.reduce((sum, l) => sum + l.text.length, 0) + t.limits.length - 1)
  }
  if (show.cost && t.cost !== undefined) {
    segments.push(t.cost.length)
  }

  return segments.reduce((sum, w) => sum + w, 0) + SEPARATOR_WIDTH * (segments.length - 1)
}

// Drops pieces in DROP_ORDER until the row fits on one line.
const fit = (state: Bar, columns: number): Show => {
  const show: Show = {
    cost: true,
    bar: true,
    tokens: true,
    until: true,
    allLimits: true,
  }

  for (const piece of DROP_ORDER) {
    if (widthOf(state, show) <= columns - SLACK) {
      break
    }
    show[piece] = false
  }

  return show
}

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
    await refresh($)

    return result
  })

  // Context and limits move with every response mid-turn; a tool call is the
  // cheap point to look. The read is free and the write only happens on change.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      if (e.usage !== undefined) {
        await merge($, { cacheHitPercent: hitPercent(e.usage) })
        await armExpiry($)
      }
      await refresh($)
    }

    return result
  })

  // Catches /model, /clear and /compact.
  on('command.run', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  // The switch says which cache lifetime applies, and the new model starts
  // with nothing cached.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    ttlMs = TTL_MS[e.cache_ttl]
    expiry?.cancel()
    await merge($, { isCacheCold: true, cacheHitPercent: undefined })
    await refresh($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, bar)

    // The band is drawn on the terminal and the desktop only; both have Select.
    if (e.props.hasSurvey || state === null || e.surface === 'mobile' || e.surface === 'vscode') {
      return next(e)
    }

    const { Box, Button, Select, Text } = $.ui.resolve(e)
    const show = fit(state, e.props.bodyColumns)
    const t = texts(state, show)
    const active = currentAlias(state.model)
    const percent = state.contextPercent
    const sep = <Text dimColor>│</Text>

    // The current model keeps its full name; an unknown one is listed first.
    const options = [
      ...(active === undefined ? [{ value: state.model, label: t.model }] : []),
      ...MODELS.map(m => ({ value: m.alias, label: m.alias === active ? t.model : m.alias })),
    ]
    const selected = active ?? state.model

    const openUsage = () => {
      void $.command.run({ command: 'usage' })
    }

    const switchTo = (value: string) => {
      if (value !== selected) {
        void $.command.run({ command: 'model', args: value })
      }
    }

    const row = (
      <Box key="band:10:model" flexDirection="row" gap={1}>
        <Select key="model" options={options} value={selected} onSelect={switchTo} />
        {sep}
        <Box key="context" flexShrink={0}>
          <Text wrap="truncate">
            <Text dimColor>ctx </Text>
            {percent === undefined ? (
              <Text dimColor>–</Text>
            ) : (
              <Text color={levelColor(percent)}>{t.contextFill}</Text>
            )}
            {t.contextTokens === '' ? null : <Text dimColor> {t.contextTokens}</Text>}
          </Text>
        </Box>
        {t.cache === undefined ? null : sep}
        {t.cache === undefined ? null : (
          <Box key="cache" flexShrink={0}>
            <Text
              color={state.isCacheCold ? 'red' : undefined}
              dimColor={!state.isCacheCold}
              wrap="truncate"
            >
              {t.cache}
            </Text>
          </Box>
        )}
        {t.limits.length > 0 ? sep : null}
        {/* A Button takes no color, so the label opens /usage and the figure keeps its level. */}
        {t.limits.map(l => (
          <Box key={`limit-${l.kind}`} flexDirection="row" flexShrink={0} gap={1}>
            <Button key={`usage-${l.kind}`} plain dimColor label={l.label} onPress={openUsage} />
            <Text color={levelColor(l.percentUsed)} wrap="truncate">
              {l.percentText}
            </Text>
          </Box>
        ))}
        {show.cost && t.cost !== undefined ? sep : null}
        {show.cost && t.cost !== undefined ? (
          <Box key="cost" flexShrink={0}>
            <Button key="usage-cost" plain dimColor label={t.cost} onPress={openUsage} />
          </Box>
        ) : null}
      </Box>
    )

    return (
      <Box key={BAND_KEY} flexDirection="column">
        {stack(await next(e), row)}
      </Box>
    )
  })
}
