import type { GitState, PrState } from './types'

// Parses `git status --porcelain=v2 --branch --show-stash`; whether the branch
// is the default one is the caller's to say. The extras (operation, diff size,
// commits on the default branch) come from other commands.
export const parseGit = (out: string, defaultBranch: string | undefined): GitState => {
  const state: GitState = {
    branch: '',
    isDetached: false,
    isDefaultBranch: false,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
    stashes: 0,
    ahead: 0,
    behind: 0,
    hasUpstream: false,
    insertions: 0,
    deletions: 0,
  }
  let oid = ''

  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.oid ')) {
      oid = line.slice(13)
    } else if (line.startsWith('# branch.head ')) {
      state.branch = line.slice(14)
    } else if (line.startsWith('# branch.upstream ')) {
      state.hasUpstream = true
    } else if (line.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(line)
      state.ahead = Number(match?.[1] ?? 0)
      state.behind = Number(match?.[2] ?? 0)
    } else if (line.startsWith('# stash ')) {
      state.stashes = Number(line.slice(8)) || 0
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4)
      if (xy[0] !== '.') state.staged += 1
      if (xy[1] !== '.') state.modified += 1
    } else if (line.startsWith('u ')) {
      state.conflicted += 1
    } else if (line.startsWith('? ')) {
      state.untracked += 1
    }
  }

  if (state.branch === '(detached)') {
    state.isDetached = true
    state.branch = `@${oid.slice(0, 7)}`
  }
  state.isDefaultBranch =
    !state.isDetached &&
    (defaultBranch !== undefined
      ? state.branch === defaultBranch
      : state.branch === 'main' || state.branch === 'master')

  return state
}

// `origin/main` from `git symbolic-ref --short refs/remotes/origin/HEAD`.
export const parseDefaultBranch = (out: string): string | undefined => {
  const ref = out.trim()

  return ref === '' ? undefined : ref.replace(/^[^/]+\//, '')
}

// `3 files changed, 120 insertions(+), 45 deletions(-)` from `git diff --shortstat`.
export const parseShortstat = (out: string): { insertions: number; deletions: number } => ({
  insertions: Number(/(\d+) insertion/.exec(out)?.[1] ?? 0),
  deletions: Number(/(\d+) deletion/.exec(out)?.[1] ?? 0),
})

type Check = { __typename?: string; status?: string; conclusion?: string; state?: string }

const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

// `gh pr view --json number,state,isDraft,reviewDecision,statusCheckRollup`.
export const parsePr = (out: string): PrState | undefined => {
  try {
    const pr = JSON.parse(out) as {
      number?: number
      state?: string
      isDraft?: boolean
      reviewDecision?: string
      statusCheckRollup?: Check[]
    }

    if (typeof pr.number !== 'number') {
      return undefined
    }

    const summary: PrState = {
      number: pr.number,
      state: pr.state === 'MERGED' || pr.state === 'CLOSED' ? pr.state : 'OPEN',
      isDraft: pr.isDraft === true,
      failing: 0,
      pending: 0,
      passing: 0,
      review:
        pr.reviewDecision === 'APPROVED' ||
        pr.reviewDecision === 'CHANGES_REQUESTED' ||
        pr.reviewDecision === 'REVIEW_REQUIRED'
          ? pr.reviewDecision
          : 'NONE',
    }

    for (const check of pr.statusCheckRollup ?? []) {
      // A check run reports status then conclusion; a commit status, state.
      const outcome = check.conclusion || check.state || ''
      if (check.status !== undefined && check.status !== 'COMPLETED') summary.pending += 1
      else if (outcome === 'PENDING' || outcome === 'EXPECTED') summary.pending += 1
      else if (FAILED.has(outcome)) summary.failing += 1
      else summary.passing += 1
    }

    return summary
  } catch {
    return undefined
  }
}
