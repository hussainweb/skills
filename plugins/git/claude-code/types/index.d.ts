// A git operation left in progress: a rebase (with its step when known),
// a merge, a cherry-pick, a revert or a bisect.
export type GitOperation = {
  kind: 'rebase' | 'merge' | 'cherry-pick' | 'revert' | 'bisect'
  step?: number
  total?: number
}

export type GitState = {
  branch: string
  isDetached: boolean
  isDefaultBranch: boolean
  // The default branch's name, as the row says it ("3 on main").
  defaultBranch?: string
  staged: number
  modified: number
  untracked: number
  conflicted: number
  stashes: number
  ahead: number
  behind: number
  hasUpstream: boolean
  operation?: GitOperation
  // Lines added and removed against HEAD, staged and unstaged together.
  insertions: number
  deletions: number
  // Commits on this branch that the default branch does not have.
  commitsOnDefault?: number
}

export type PrState = {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  failing: number
  pending: number
  passing: number
  review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'NONE'
}

declare module 'claude-code' {
  interface PluginState {
    git: { git: GitState | null; pr: PrState | null }
  }
}
