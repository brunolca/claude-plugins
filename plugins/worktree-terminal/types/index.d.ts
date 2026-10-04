export type Worktree = { path: string; branch?: string; isAgent: boolean }

declare module 'claude-code' {
  interface PluginState {
    'worktree-terminal': { worktrees: Worktree[]; isHidden: boolean }
  }
}
