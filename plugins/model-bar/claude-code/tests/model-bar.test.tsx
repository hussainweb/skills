import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const

const HOUR = 60 * 60_000

const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns,
  scroll: { bodyRows: 10, offset: 0 },
  view: {},
  title: '',
})

// `beneath` is what the mods under this one drew: one plain row, or ranked band rows by key.
const engine = (on: On, model: string, beneath?: string | string[]) => {
  const switched: string[] = []
  const reads = { usage: 0, usagePanel: 0 }

  on('session.model', () => ({ value: model }))
  on('session.usage', () => {
    reads.usage += 1

    return {
      value: {
        startedAt: 0,
        context: { tokens: 620_000, window: 1_000_000, percent: 62 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 38.4 },
          { kind: 'seven_day', percentUsed: 12 },
        ],
        cost: { usd: 1.234 },
      },
    }
  })
  on('command.run', { command: 'model' }, (_$, e) => {
    switched.push(e.args)

    return {}
  })
  on('command.run', { command: 'usage' }, () => {
    reads.usagePanel += 1

    return {}
  })
  on('turn.complete', () => ({ text: '' }))
  // The engine draws nothing of its own in the band.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    if (Array.isArray(beneath)) {
      return (
        <Box key="band-rows" flexDirection="column">
          {beneath.map(key => (
            <Box key={key}>
              <Text>{key}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    return beneath === undefined ? (
      <Box />
    ) : (
      <Box key="beneath">
        <Text>{beneath}</Text>
      </Box>
    )
  })

  return { switched, reads }
}

// A main-loop turn whose input was 90% served from the cache.
const completeTurn = ($: Engine) =>
  $.turn.complete({
    answer: '',
    durationMs: 1_000,
    reason: 'answer',
    isAborted: false,
    turnId: 't1',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 1_000,
      output_tokens: 500,
      cache_read_input_tokens: 9_000,
      cache_creation_input_tokens: 0,
    },
  })

const mount = ($: Engine, surface: (typeof SURFACES)[number], bodyColumns = 120) =>
  $.ui.mount({
    plugin: 'model-bar',
    surface,
    component: 'AbovePrompt',
    props: bandProps(bodyColumns) as never,
  })

const text = async (ui: Awaited<ReturnType<typeof mount>>, key: string) =>
  (await ui.find({ key }))?.text

test('draws nothing until an event has filled it', async ($, on) => {
  engine(on, 'claude-opus-5-5')

  for (const surface of SURFACES) {
    const ui = await mount($, surface)

    expect(await ui.find({ key: 'context' })).toBeUndefined()
    await ui.unmount()
  }
})

test('shows the model, context, cache and limits after a turn', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5')
  await completeTurn($)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)

    expect((await ui.find({ key: 'model', type: 'Select' }))?.props.value).toBe('opus')
    expect(await text(ui, 'context')).toContain('▓▓▓▓▓▓░░░░ 62%')
    expect(await text(ui, 'context')).toContain('620k/1M')
    expect(await text(ui, 'cache')).toContain('90% hit')
    expect(await text(ui, 'cache')).toContain('until')
    expect((await ui.find({ key: 'usage-five_hour', type: 'Button' }))?.props.label).toBe('5h')
    expect(await text(ui, 'limit-five_hour')).toContain('38%')
    expect((await ui.find({ key: 'usage-seven_day', type: 'Button' }))?.props.label).toBe('7d')
    expect(await text(ui, 'limit-seven_day')).toContain('12%')
    expect(await text(ui, 'cost')).toContain('$1.23')
    await ui.unmount()
  }
})

test('drawing reads no usage from the host', async ($, on) => {
  mock.clock(on, { now: 0 })
  const { reads } = engine(on, 'claude-opus-5-5')
  await completeTurn($)
  const before = reads.usage

  for (const surface of SURFACES) {
    const ui = await mount($, surface)

    await ui.unmount()
  }

  expect(reads.usage).toBe(before)
})

test('the cache goes cold once its lifetime passes without a response', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5')
  await completeTurn($)

  await clock.advance(HOUR - 1_000)
  const warm = await mount($, 'terminal')
  expect(await text(warm, 'cache')).toContain('90% hit')
  await warm.unmount()

  await clock.advance(2_000)
  const cold = await mount($, 'terminal')
  expect(await text(cold, 'cache')).toBe('cache cold')
  await cold.unmount()
})

test('a new response pushes the expiry out', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5')
  await completeTurn($)
  await clock.advance(HOUR / 2)
  await completeTurn($)
  await clock.advance(HOUR - 1_000)

  const ui = await mount($, 'terminal')
  expect(await text(ui, 'cache')).not.toBe('cache cold')
  await ui.unmount()
})

test('picking a different model runs /model with its alias; the current one does nothing', async ($, on) => {
  mock.clock(on, { now: 0 })
  const { switched } = engine(on, 'claude-opus-5-5')
  await completeTurn($)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)

    await ui.select({ key: 'model', value: 'opus' })
    await ui.select({ key: 'model', value: 'sonnet' })
    await ui.unmount()
  }

  expect(switched).toEqual(['sonnet', 'sonnet'])
})

test('pressing a limit label or the cost opens /usage', async ($, on) => {
  mock.clock(on, { now: 0 })
  const { reads } = engine(on, 'claude-opus-5-5')
  await completeTurn($)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)

    await ui.press({ key: 'usage-five_hour' })
    await ui.press({ key: 'usage-seven_day' })
    await ui.press({ key: 'usage-cost' })
    await ui.unmount()
  }

  expect(reads.usagePanel).toBe(6)
})

test('a narrow band keeps the picker and the percentage', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-sonnet-5-5')
  await completeTurn($)

  for (const surface of SURFACES) {
    const ui = await mount($, surface, 60)

    expect((await ui.find({ key: 'model', type: 'Select' }))?.props.value).toBe('sonnet')
    expect(await text(ui, 'context')).not.toContain('▓')
    await ui.unmount()
  }
})

test('a mid-width band drops the least useful pieces first, keeping the cache whole', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5')
  await completeTurn($)

  for (const surface of SURFACES) {
    // The full row needs 93 columns plus 2 of slack; 80 costs it the bar and the dollar figure.
    const ui = await mount($, surface, 80)

    expect(await ui.find({ key: 'cost' })).toBeUndefined()
    expect(await text(ui, 'context')).not.toContain('▓')
    expect(await text(ui, 'context')).toContain('620k/1M')
    expect(await text(ui, 'cache')).toContain('90% hit until')
    await ui.unmount()
  }
})

test('a wide band shows everything, the bar and the cost included', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5')
  await completeTurn($)

  const ui = await mount($, 'terminal', 110)

  expect(await text(ui, 'context')).toContain('▓')
  expect(await text(ui, 'cost')).toBe('$1.23')
  await ui.unmount()
})

test('every segment is a direct child of the row, never inside a fragment', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5')
  await completeTurn($)

  const ui = await mount($, 'terminal', 140)
  const row = (await ui.find({ key: 'band:10:model' })) as unknown as { children: { type?: string }[] }
  const types = row.children.map(child => child.type)

  expect(types.length).toBeGreaterThan(5)
  expect(types.every(type => type === 'Box' || type === 'Text' || type === 'Select')).toBe(true)
  await ui.unmount()
})

test('its row sits above what the mods beneath drew', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5', 'work row')
  await completeTurn($)

  const ui = await mount($, 'terminal', 140)
  const root = (await ui.drawn()) as unknown as { children: { key?: string; props?: { key?: string } }[] }
  const keys = root.children.map(child => child.props?.key ?? child.key)

  expect(keys).toEqual(['band:10:model', 'beneath'])
  await ui.unmount()
})

test('its row takes its rank among the rows the mods beneath drew', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on, 'claude-opus-5-5', ['band:20:git', 'band:30:beads'])
  await completeTurn($)

  const ui = await mount($, 'terminal', 140)
  const root = (await ui.drawn()) as unknown as { children: { props?: { key?: string } }[] }

  expect(root.children.map(child => child.props?.key)).toEqual(['band:10:model', 'band:20:git', 'band:30:beads'])
  await ui.unmount()
})
