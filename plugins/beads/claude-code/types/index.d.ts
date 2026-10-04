export type BeadsState = {
  latest?: { id: string; title: string }
  others: number
  ready: number
  due: number
}

declare module 'claude-code' {
  interface PluginState {
    beads: { beads: BeadsState | null }
  }
}
