import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  ProcessRunInit,
  ProcessRunResult,
  Register,
  RenderElement,
} from 'claude-code'

import type { GitOperation, GitState, PrState } from './types'
import { parseDefaultBranch, parseGit, parsePr, parseShortstat } from './git'

// Events fill these and the band only reads them, so drawing runs no commands.
const git = atom({ plugin: 'git', key: 'git' } as const, null)
const pr = atom({ plugin: 'git', key: 'pr' } as const, null)

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

const GIT_TIMEOUT = { timeoutMs: 5_000 }

// A file's text, or undefined when it is missing or unreadable.
const readFile = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

const exists = async ($: EngineInterface, path: string): Promise<boolean> => {
  try {
    return await $.fs.exists(path)
  } catch {
    return false
  }
}

// What git has left in progress, read from the files it keeps in the git
// directory while it waits on the person.
const operationIn = async (
  $: EngineInterface,
  gitDir: string,
): Promise<GitOperation | undefined> => {
  for (const [dir, stepFile, totalFile] of [
    ['rebase-merge', 'msgnum', 'end'],
    ['rebase-apply', 'next', 'last'],
  ] as const) {
    if (await exists($, `${gitDir}/${dir}`)) {
      const step = Number((await readFile($, `${gitDir}/${dir}/${stepFile}`))?.trim())
      const total = Number((await readFile($, `${gitDir}/${dir}/${totalFile}`))?.trim())

      return {
        kind: 'rebase',
        step: Number.isFinite(step) && step > 0 ? step : undefined,
        total: Number.isFinite(total) && total > 0 ? total : undefined,
      }
    }
  }
  for (const [file, kind] of [
    ['MERGE_HEAD', 'merge'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
    ['BISECT_LOG', 'bisect'],
  ] as const) {
    if (await exists($, `${gitDir}/${file}`)) {
      return { kind }
    }
  }

  return undefined
}

// The default branch, read once per session from origin/HEAD; null when the
// repository has no such ref, so main and master stand in.
let defaultBranch: string | null | undefined

// The branch the PR line was last looked up for.
let prBranch: string | undefined

const refreshGit = async ($: EngineInterface) => {
  if (defaultBranch === undefined) {
    const ref = await run(
      $,
      ['git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      GIT_TIMEOUT,
    )
    defaultBranch = ref?.exitCode === 0 ? (parseDefaultBranch(ref.stdout) ?? null) : null
  }

  const [status, gitDir] = await Promise.all([
    run($, ['git', 'status', '--porcelain=v2', '--branch', '--show-stash'], GIT_TIMEOUT),
    run($, ['git', 'rev-parse', '--absolute-git-dir'], GIT_TIMEOUT),
  ])

  if (status?.exitCode !== 0) {
    await update($, git, prev => (prev === null ? prev : null))
    return
  }

  const state = parseGit(status.stdout, defaultBranch ?? undefined)

  if (gitDir?.exitCode === 0) {
    state.operation = await operationIn($, gitDir.stdout.trim())
  }

  if (state.staged + state.modified + state.conflicted > 0) {
    const diff = await run($, ['git', 'diff', '--shortstat', 'HEAD'], GIT_TIMEOUT)
    if (diff?.exitCode === 0) {
      Object.assign(state, parseShortstat(diff.stdout))
    }
  }

  if (!state.isDefaultBranch && !state.isDetached) {
    // origin's copy when origin/HEAD named it, else a local main or master.
    const bases =
      defaultBranch !== null && defaultBranch !== undefined
        ? [[`origin/${defaultBranch}`, defaultBranch]]
        : [
            ['main', 'main'],
            ['master', 'master'],
          ]
    for (const [ref, name] of bases) {
      const count = await run($, ['git', 'rev-list', '--count', `${ref}..HEAD`], GIT_TIMEOUT)
      if (count?.exitCode === 0) {
        state.defaultBranch = name
        state.commitsOnDefault = Number(count.stdout.trim()) || 0
        break
      }
    }
  }

  await update($, git, prev => (same(prev, state) ? (prev ?? null) : state))

  // A new branch has a different PR, if any.
  if (state.branch !== prBranch) {
    void refreshPr($)
  }
}

let isPrRunning = false

// The PR for the checked-out branch, with its checks and review. A network
// call, so it is never waited on; only a pushed feature branch can have one.
const refreshPr = async ($: EngineInterface) => {
  if (isPrRunning) {
    return
  }
  isPrRunning = true

  try {
    const g = await read($, git)
    prBranch = g?.branch
    let next: PrState | null = null

    if (g !== null && !g.isDetached && !g.isDefaultBranch && g.hasUpstream) {
      const ran = await run(
        $,
        ['gh', 'pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'],
        { timeoutMs: 15_000 },
      )
      next = ran?.exitCode === 0 ? (parsePr(ran.stdout) ?? null) : null
    }

    await update($, pr, prev => (same(prev, next) ? (prev ?? null) : next))
  } finally {
    isPrRunning = false
  }
}

// Tools that can change the working tree.
const WRITERS = new Set(['Bash', 'Edit', 'Write', 'NotebookEdit'])

// What can change a PR from here: a push, or gh acting on one.
const TOUCHES_PR = /(^|[\s;&|(])(git\s+push|gh\s+pr)\b/

const opText = (op: GitOperation): string =>
  op.step !== undefined && op.total !== undefined
    ? `⚠ ${op.kind} ${op.step}/${op.total}`
    : `⚠ ${op.kind}`

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
  // Git is quick and awaited where a turn or command ends; gh is a network
  // call, so it is never waited on.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    defaultBranch = undefined
    prBranch = undefined
    await refreshGit($)
    void refreshPr($)

    return result
  })

  // Not awaited: the tool's result goes back without waiting on any of them.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)

    if (WRITERS.has(e.tool)) {
      void refreshGit($)
    }
    if (e.tool === 'Bash' && TOUCHES_PR.test(e.command)) {
      void refreshPr($)
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refreshGit($)

    if (e.agentId === undefined) {
      void refreshPr($)
    }

    return result
  })

  // A `! git commit` the person ran, /clear, /resume.
  on('command.run', async ($, e, next) => {
    const result = await next(e)
    await refreshGit($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const g = await read($, git)
    const p = await read($, pr)

    if (e.props.hasSurvey || g === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    const branchColor = g.isDetached ? 'red' : g.isDefaultBranch ? 'green' : 'magenta'
    const isClean = g.staged + g.modified + g.untracked + g.conflicted === 0
    const hasDiff = g.insertions + g.deletions > 0

    const row = (
      <Box key="band:20:git">
        <Text wrap="truncate">
          <Text color={branchColor}>⎇ {g.branch}</Text>
          {g.operation === undefined ? null : (
            <Text color="red" bold>
              {' '}
              {opText(g.operation)}
            </Text>
          )}
          {g.conflicted > 0 ? <Text color="red"> ✖{g.conflicted}</Text> : null}
          {g.staged > 0 ? <Text color="green"> +{g.staged}</Text> : null}
          {g.modified > 0 ? <Text color="yellow"> ●{g.modified}</Text> : null}
          {g.untracked > 0 ? <Text dimColor> ?{g.untracked}</Text> : null}
          {isClean ? <Text color="green"> ✓</Text> : null}
          {hasDiff ? (
            <Text>
              <Text dimColor> (</Text>
              <Text color="green">+{g.insertions}</Text>
              <Text dimColor> </Text>
              <Text color="red">−{g.deletions}</Text>
              <Text dimColor>)</Text>
            </Text>
          ) : null}
          {g.stashes > 0 ? <Text color="magenta"> ⚑{g.stashes}</Text> : null}
          {g.ahead > 0 ? <Text color="cyan"> ↑{g.ahead}</Text> : null}
          {g.behind > 0 ? <Text color="yellow"> ↓{g.behind}</Text> : null}
          {g.hasUpstream ? null : <Text dimColor> (no upstream)</Text>}
          {g.commitsOnDefault !== undefined && g.commitsOnDefault > 0 ? (
            <Text dimColor>
              {' '}
              · {g.commitsOnDefault} on {g.defaultBranch}
            </Text>
          ) : null}
          {p === null ? null : (
            <Text>
              <Text dimColor>{'  │  '}</Text>
              <Text color="cyan">#{p.number}</Text>
              {p.state === 'MERGED' ? <Text color="magenta"> merged</Text> : null}
              {p.state === 'CLOSED' ? <Text dimColor> closed</Text> : null}
              {p.state === 'OPEN' && p.isDraft ? <Text dimColor> draft</Text> : null}
              {p.state === 'OPEN' && p.failing > 0 ? (
                <Text color="red"> ✖ {p.failing} failing</Text>
              ) : null}
              {p.state === 'OPEN' && p.failing === 0 && p.pending > 0 ? (
                <Text color="yellow"> ◷ {p.pending} pending</Text>
              ) : null}
              {p.state === 'OPEN' && p.failing === 0 && p.pending === 0 && p.passing > 0 ? (
                <Text color="green"> ✓ checks</Text>
              ) : null}
              {p.state === 'OPEN' && p.review === 'APPROVED' ? (
                <Text color="green"> · approved</Text>
              ) : null}
              {p.state === 'OPEN' && p.review === 'CHANGES_REQUESTED' ? (
                <Text color="red"> · changes requested</Text>
              ) : null}
              {p.state === 'OPEN' && p.review === 'REVIEW_REQUIRED' ? (
                <Text dimColor> · review needed</Text>
              ) : null}
            </Text>
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
