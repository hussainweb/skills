export type BeadsState = {
  latest?: { id: string; title: string }
  others: number
  ready: number
  due: number
  // Persistent memories (`bd remember`) and the estimated tokens `bd prime`
  // injects, when bd could report them.
  memories?: number
  primeTokens?: number
}

declare module 'claude-code' {
  interface PluginState {
    beads: { beads: BeadsState | null }
  }
}
