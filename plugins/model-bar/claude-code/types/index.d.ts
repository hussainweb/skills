export type Limit = { kind: string; percentUsed: number }

export type Bar = {
  model: string
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
  costUsd?: number
  // Share of the last turn's input the prompt cache served, 0 to 100.
  cacheHitPercent?: number
  // When the cache lapses, in epoch milliseconds, unless a response refreshes it.
  cacheWarmUntil?: number
  isCacheCold: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'model-bar': { bar: Bar | null }
  }
}
