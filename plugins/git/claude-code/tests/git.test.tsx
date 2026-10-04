import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-03T12:00:00Z')
const GIT_DIR = '/repo/.git'

const porcelain = (branch: string, extra: string[] = [], hasUpstream = true) =>
  [
    '# branch.oid f3093320c5228cf2ab227c51ef6bd83e8e696484',
    `# branch.head ${branch}`,
    ...(hasUpstream ? ['# branch.upstream origin/main', '# branch.ab +2 -1'] : []),
    ...extra,
    '',
  ].join('\n')

const DIRTY = [
  '# stash 3',
  '1 M. N... 100644 100644 100644 a b src/staged.ts',
  '1 .M N... 100644 100644 100644 a b src/edited.ts',
  '1 MM N... 100644 100644 100644 a b src/both.ts',
  '? notes.txt',
]




type World = {
  git?: string
  originHead?: string
  // Commands that cannot start at all (not installed, timed out).
  missing?: string[]
  // Files in the git directory, by name relative to it, with their text.
  gitFiles?: Record<string, string>
  shortstat?: string
  // `rev-list --count <ref>..HEAD` answers, by ref.
  revCounts?: Record<string, number>
  // `gh pr view --json ...` output; absent means the branch has no PR.
  prJson?: unknown
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

    if (world.missing?.includes(e.argv[0] ?? '')) {
      throw new Error(`${e.argv[0]}: command not found`)
    }
    if (e.argv[0] === 'gh') {
      return world.prJson === undefined ? run(1, '') : run(0, JSON.stringify(world.prJson))
    }
    if (e.argv[0] === 'git') {
      if (world.git === undefined) return run(128, '')
      if (args.startsWith('git symbolic-ref')) {
        return world.originHead === undefined ? run(128, '') : run(0, `${world.originHead}\n`)
      }
      if (args.startsWith('git rev-parse')) return run(0, `${GIT_DIR}\n`)
      if (args.startsWith('git diff')) return run(0, world.shortstat ?? '')
      if (args.startsWith('git rev-list')) {
        const ref = /--count (\S+)\.\.HEAD/.exec(args)?.[1] ?? ''
        const count = world.revCounts?.[ref]

        return count === undefined ? run(128, '') : run(0, `${count}\n`)
      }

      return run(0, world.git)
    }
    return run(1, '')
  })
  on('fs.exists', (_$, e) => ({
    value: Object.keys(world.gitFiles ?? {}).some(
      name => `${GIT_DIR}/${name}` === e.path || `${GIT_DIR}/${name}`.startsWith(`${e.path}/`),
    ),
  }))
  on('fs.read', (_$, e) => {
    const name = e.path.slice(GIT_DIR.length + 1)
    const text = world.gitFiles?.[name]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)

    return { value: text }
  })
  on('turn.complete', () => ({ text: '' }))
  // What the mods beneath drew: model-bar's and beads' rows, in a session.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="band-rows" flexDirection="column">
        <Box key="band:10:model">
          <Text>model row</Text>
        </Box>
        <Box key="band:30:beads">
          <Text>beads row</Text>
        </Box>
      </Box>
    )
  })

  return { calls, clock }
}

// gh runs unawaited, so let them settle before looking.
const completeTurn = async ($: Engine, clock: { settle: () => Promise<void> }, agentId?: string) => {
  await $.turn.complete({ answer: '', durationMs: 1, reason: 'answer', isAborted: false, turnId: 't', agentId })
  await clock.settle()
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
  $.ui.mount({ plugin: 'git', surface, component: 'AbovePrompt', props: BAND as never })

type Mounted = Awaited<ReturnType<typeof mount>>

const gitRow = async (ui: Mounted) => (await ui.find({ key: 'band:20:git' }))?.text

const colorOf = async (ui: Mounted, text: RegExp) =>
  (await ui.find({ type: 'Text', text }))?.props.color

test('its row sits between model-bar and beads, whatever the load order', async ($, on) => {
  const { clock } = engine(on, { git: porcelain('main'), originHead: 'origin/main' })
  await completeTurn($, clock)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount($, surface)
    const root = (await ui.drawn()) as unknown as { children: { props?: { key?: string } }[] }

    expect(root.children.map(c => c.props?.key)).toEqual(['band:10:model', 'band:20:git', 'band:30:beads'])
    await ui.unmount()
  }
})

test('outside a repository the band is left to the others', async ($, on) => {
  const { clock } = engine(on)
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await ui.find({ key: 'band:20:git' })).toBeUndefined()
  expect(await ui.find({ key: 'band:10:model' })).toBeDefined()
  await ui.unmount()
})

test('without git installed nothing fails', async ($, on) => {
  const { clock } = engine(on, { git: porcelain('feat/x'), prJson: { number: 1 }, missing: ['git', 'gh'] })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await ui.find({ key: 'band:20:git' })).toBeUndefined()
  await ui.unmount()
})

test('a subagent finishing refreshes git but not the PR', async ($, on) => {
  const { calls, clock } = engine(on, { git: porcelain('feat/x'), originHead: 'origin/main', prJson: { number: 1 } })
  // The first refresh looks the branch's PR up once, as any new branch does.
  await completeTurn($, clock)
  const before = calls.filter(c => c.startsWith('gh')).length

  await completeTurn($, clock, 'agent-1')

  expect(calls.filter(c => c.startsWith('gh')).length).toBe(before)
})

test('the default branch is green, a feature branch magenta, a detached head red', async ($, on) => {
  const world: World = { git: porcelain('main'), originHead: 'origin/main' }
  const { clock } = engine(on, world)

  await completeTurn($, clock)
  let ui = await mount($)
  expect(await colorOf(ui, /^⎇ main$/)).toBe('green')
  await ui.unmount()

  world.git = porcelain('feature/login')
  await completeTurn($, clock)
  ui = await mount($)
  expect(await colorOf(ui, /^⎇ feature\/login$/)).toBe('magenta')
  await ui.unmount()

  world.git = porcelain('(detached)')
  await completeTurn($, clock)
  ui = await mount($)
  expect(await colorOf(ui, /^⎇ @f309332$/)).toBe('red')
  await ui.unmount()
})

test('origin/HEAD names the default branch; without it main and master stand in', async ($, on) => {
  const { clock } = engine(on, { git: porcelain('develop'), originHead: 'origin/develop' })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await colorOf(ui, /^⎇ develop$/)).toBe('green')
  await ui.unmount()
})

test('a rebase in progress shows its step', async ($, on) => {
  const { clock } = engine(on, {
    git: porcelain('(detached)'),
    gitFiles: { 'rebase-merge/msgnum': '3\n', 'rebase-merge/end': '7\n' },
  })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await gitRow(ui)).toContain('⚠ rebase 3/7')
  expect(await colorOf(ui, /^ ⚠ rebase 3\/7$/)).toBe('red')
  await ui.unmount()
})

test('a merge, cherry-pick, revert or bisect in progress is named', async ($, on) => {
  const world: World = { git: porcelain('main') }
  const { clock } = engine(on, world)

  for (const [file, label] of [
    ['MERGE_HEAD', '⚠ merge'],
    ['CHERRY_PICK_HEAD', '⚠ cherry-pick'],
    ['REVERT_HEAD', '⚠ revert'],
    ['BISECT_LOG', '⚠ bisect'],
  ] as const) {
    world.gitFiles = { [file]: 'x' }
    await completeTurn($, clock)
    const ui = await mount($)
    expect(await gitRow(ui)).toContain(label)
    await ui.unmount()
  }
})

test('a feature branch counts its commits on top of the default branch', async ($, on) => {
  const { clock } = engine(on, {
    git: porcelain('feat/band'),
    originHead: 'origin/main',
    revCounts: { 'origin/main': 3 },
  })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await gitRow(ui)).toBe('⎇ feat/band ✓ ↑2 ↓1 · 3 on main')
  await ui.unmount()
})

test('without origin/HEAD the count falls back to a local main or master', async ($, on) => {
  const { clock } = engine(on, { git: porcelain('feat/band'), revCounts: { master: 4 } })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await gitRow(ui)).toContain('· 4 on master')
  await ui.unmount()
})

test('a PR shows its number, checks and review', async ($, on) => {
  const world: World = {
    git: porcelain('feat/band'),
    originHead: 'origin/main',
    revCounts: { 'origin/main': 3 },
    prJson: {
      number: 214,
      state: 'OPEN',
      isDraft: false,
      reviewDecision: 'APPROVED',
      statusCheckRollup: [
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'StatusContext', state: 'SUCCESS' },
      ],
    },
  }
  const { clock } = engine(on, world)
  await completeTurn($, clock)

  let ui = await mount($)
  expect(await gitRow(ui)).toBe('⎇ feat/band ✓ ↑2 ↓1 · 3 on main  │  #214 ✓ checks · approved')
  expect(await colorOf(ui, /^#214$/)).toBe('cyan')
  await ui.unmount()

  world.prJson = {
    number: 214,
    state: 'OPEN',
    isDraft: true,
    reviewDecision: 'CHANGES_REQUESTED',
    statusCheckRollup: [
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
    ],
  }
  await completeTurn($, clock)
  ui = await mount($)
  expect(await gitRow(ui)).toContain('#214 draft ✖ 2 failing · changes requested')
  await ui.unmount()

  world.prJson = {
    number: 214,
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'REVIEW_REQUIRED',
    statusCheckRollup: [{ __typename: 'CheckRun', status: 'QUEUED', conclusion: '' }],
  }
  await completeTurn($, clock)
  ui = await mount($)
  expect(await gitRow(ui)).toContain('#214 ◷ 1 pending · review needed')
  await ui.unmount()

  world.prJson = { number: 214, state: 'MERGED', isDraft: false, reviewDecision: '', statusCheckRollup: [] }
  await completeTurn($, clock)
  ui = await mount($)
  expect(await gitRow(ui)).toContain('#214 merged')
  await ui.unmount()
})

test('gh is not asked on the default branch or an unpushed branch', async ($, on) => {
  const world: World = { git: porcelain('main'), originHead: 'origin/main', prJson: { number: 1 } }
  const { calls, clock } = engine(on, world)
  await completeTurn($, clock)

  world.git = porcelain('feat/local', [], false)
  await completeTurn($, clock)

  expect(calls.some(c => c.startsWith('gh'))).toBe(false)
})

test('a branch without a PR shows no PR segment', async ($, on) => {
  const { clock } = engine(on, { git: porcelain('feat/band'), originHead: 'origin/main' })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await gitRow(ui)).not.toContain('#')
  await ui.unmount()
})

test('changes, stashes and divergence each carry their colour', async ($, on) => {
  const { clock } = engine(on, {
    git: porcelain('main', DIRTY),
    shortstat: ' 3 files changed, 120 insertions(+), 45 deletions(-)\n',
  })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await colorOf(ui, /^ \+2$/)).toBe('green')
  expect(await colorOf(ui, /^ ●2$/)).toBe('yellow')
  expect(await colorOf(ui, /^\+120$/)).toBe('green')
  expect(await colorOf(ui, /^−45$/)).toBe('red')
  expect(await colorOf(ui, /^ ⚑3$/)).toBe('magenta')
  expect(await colorOf(ui, /^ ↑2$/)).toBe('cyan')
  expect(await colorOf(ui, /^ ↓1$/)).toBe('yellow')
  await ui.unmount()
})

test('a clean tree shows a green tick and no diff size', async ($, on) => {
  const { calls, clock } = engine(on, { git: porcelain('main') })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await colorOf(ui, /^ ✓$/)).toBe('green')
  expect(await gitRow(ui)).not.toContain('(')
  expect(calls.some(c => c.startsWith('git diff'))).toBe(false)
  await ui.unmount()
})

test('origin/HEAD is read once, not on every refresh', async ($, on) => {
  const { calls, clock } = engine(on, { git: porcelain('main') })
  await completeTurn($, clock)
  await completeTurn($, clock)

  expect(calls.filter(c => c.startsWith('git symbolic-ref')).length).toBe(1)
})

test('without gh installed, git still shows', async ($, on) => {
  const { clock } = engine(on, {
    git: porcelain('feat/x'),
    originHead: 'origin/main',
    revCounts: { 'origin/main': 1 },
    missing: ['gh'],
  })
  await completeTurn($, clock)

  const ui = await mount($)
  expect(await gitRow(ui)).toBe('⎇ feat/x ✓ ↑2 ↓1 · 1 on main')
  await ui.unmount()
})
