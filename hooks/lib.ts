import type { Worktree } from '../types'

// Where Claude Code puts the worktrees of agents (Agent isolation: "worktree", EnterWorktree).
const AGENT_WORKTREE = /\/\.claude\/worktrees\//

export const parseWorktrees = (porcelain: string): Worktree[] =>
  porcelain.split(/\n\n+/).flatMap((block): Worktree[] => {
    const lines = block.split('\n')
    const path = lines.find(line => line.startsWith('worktree '))?.slice(9)
    const branch = lines.find(line => line.startsWith('branch '))?.slice(7).replace(/^refs\/heads\//, '')
    if (path === undefined) return []

    return [branch === undefined
      ? { path, isAgent: AGENT_WORKTREE.test(path) }
      : { path, branch, isAgent: AGENT_WORKTREE.test(path) }]
  })

export const label = (worktree: Worktree): string =>
  worktree.path.split('/').filter(Boolean).pop() ?? worktree.path

// `query` is a 1-based index, `main`, or part of a worktree's folder name or branch.
export const findWorktree = (worktrees: readonly Worktree[], query: string): Worktree | undefined => {
  const index = Number(query)
  if (Number.isInteger(index) && index >= 1) {
    return worktrees[index - 1]
  }
  if (query === 'main') {
    return worktrees[0]
  }
  const needle = query.toLowerCase()

  return (
    worktrees.find(one => label(one).toLowerCase() === needle || one.branch?.toLowerCase() === needle) ??
    worktrees.find(one => label(one).toLowerCase().includes(needle) || one.branch?.toLowerCase().includes(needle))
  )
}

// `NAME=value` lines, as the env probe prints them.
export const parseEnv = (text: string): Record<string, string> =>
  Object.fromEntries(
    text.split('\n').flatMap(line => {
      const at = line.indexOf('=')

      return at <= 0 ? [] : [[line.slice(0, at), line.slice(at + 1)]]
    }),
  )
