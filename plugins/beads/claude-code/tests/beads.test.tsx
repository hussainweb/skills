import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-03T12:00:00Z')

const IN_PROGRESS = [
  { id: 'stele-old', title: 'Older work', updated_at: '2026-09-01T00:00:00Z' },
  {
    id: 'stele-zyi',
    title: 'Ask activity page: give the usage panel a typographic hierarchy',
    updated_at: '2026-10-02T00:00:00Z',
  },
]

const DEFERRED = [
  { id: 'stele-a', title: 'a', defer_until: '2026-10-01T04:00:00Z' },
  { id: 'stele-b', title: 'b', defer_until: '2026-10-17T04:00:00Z' },
]

const BEADS_LINE =
  '◆ stele-zyi Ask activity page: give the usage panel… (+1) · 111 ready · 1 deferred due'

type World = {
  hasBeads?: boolean
  inProgress?: unknown[]
  // bd cannot start at all (not installed, timed out).
  isMissing?: boolean
}

const run = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const engine = (on: On, world: World = {}) => {
  const calls: string[] = []
  const clock = mock.clock(on, { now: NOW })

  on('process.run', (_$, e) => {
    const args = e.argv.join(' ')
    calls.push(args)

    if (world.isMissing === true) throw new Error('bd: command not found')
    if (world.hasBeads !== true) return run(1, '')
    if (args.includes('in_progress')) return run(0, JSON.stringify(world.inProgress ?? IN_PROGRESS))
    if (args.includes('ready')) {
      return run(0, JSON.stringify(Array.from({ length: 111 }, (_, i) => ({ id: `r${i}`, title: '' }))))
    }

    return run(0, JSON.stringify(DEFERRED))
  })
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ isError: false, text: '' }) as never)
  // What the mods beneath drew: model-bar's and git's rows, in a session.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="band-rows" flexDirection="column">
        <Box key="band:10:model">
          <Text>model row</Text>
        </Box>
        <Box key="band:20:git">
          <Text>git row</Text>
        </Box>
      </Box>
    )
  })

  return { calls, clock }
}

// bd runs unawaited, so let it settle before looking.
const completeTurn = async ($: Engine, clock: { settle: () => Promise<void> }, agentId?: string) => {
  await $.turn.complete({ answer: '', durationMs: 1, reason: 'answer', isAborted: false, turnId: 't', agentId })
  await clock.settle()
}

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 200,
  scroll: { bodyRows: 10, offset: 0 },
  view: {},
  title: '',
}

const mount = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'beads', surface, component: 'AbovePrompt', props: BAND as never })

test('shows the latest bead in progress, the ready count and what is due, under git', async ($, on) => {
  const { clock } = engine(on, { hasBeads: true })
  await completeTurn($, clock)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount($, surface)
    const root = (await ui.drawn()) as unknown as { children: { props?: { key?: string } }[] }

    expect(root.children.map(c => c.props?.key)).toEqual(['band:10:model', 'band:20:git', 'band:30:beads'])
    expect((await ui.find({ key: 'band:30:beads' }))?.text).toBe(BEADS_LINE)
    await ui.unmount()
  }
})

test('the bead id is cyan and what is due is yellow', async ($, on) => {
  const { clock } = engine(on, { hasBeads: true })
  await completeTurn($, clock)

  const ui = await mount($)
  expect((await ui.find({ type: 'Text', text: /^◆ stele-zyi$/ }))?.props.color).toBe('cyan')
  expect((await ui.find({ type: 'Text', text: /^ · 1 deferred due$/ }))?.props.color).toBe('yellow')
  await ui.unmount()
})

test('with nothing in progress the row shows the counts alone', async ($, on) => {
  const { clock } = engine(on, { hasBeads: true, inProgress: [] })
  await completeTurn($, clock)

  const ui = await mount($)
  expect((await ui.find({ key: 'band:30:beads' }))?.text).toBe('111 ready · 1 deferred due')
  await ui.unmount()
})

test('outside a beads workspace the band is left to the others', async ($, on) => {
  const { clock } = engine(on)
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await ui.find({ key: 'band:30:beads' })).toBeUndefined()
  expect(await ui.find({ key: 'band:20:git' })).toBeDefined()
  await ui.unmount()
})

test('without bd installed nothing fails', async ($, on) => {
  const { clock } = engine(on, { isMissing: true })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await ui.find({ key: 'band:30:beads' })).toBeUndefined()
  await ui.unmount()
})

test('a subagent finishing does not query beads', async ($, on) => {
  const { calls, clock } = engine(on, { hasBeads: true })
  await completeTurn($, clock, 'agent-1')

  expect(calls).toEqual([])
})
