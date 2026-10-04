import { describe, expect, test } from 'claude-code/testing'

import { findWorktree, parseEnv, parseWorktrees } from '../hooks/lib'
import { PORCELAIN } from './fixtures'


describe('worktrees', () => {
  test('parses git porcelain and flags agent worktrees', async () => {
    expect(parseWorktrees(PORCELAIN).map(one => [one.path, one.branch, one.isAgent])).toEqual([
      ['/repo', 'main', false],
      ['/repo/.claude/worktrees/agent-fix-login', 'worktree-agent-fix-login', true],
      ['/repo/.claude/worktrees/docs', undefined, true],
    ])
  })

  test('finds by index, main, or name', async () => {
    const list = parseWorktrees(PORCELAIN)
    expect(findWorktree(list, '3')?.path).toBe('/repo/.claude/worktrees/docs')
    expect(findWorktree(list, 'main')?.path).toBe('/repo')
    expect(findWorktree(list, 'login')?.path).toBe('/repo/.claude/worktrees/agent-fix-login')
    expect(findWorktree(list, 'nope')).toBeUndefined()
  })

  test('parses the env probe, values with = kept whole', async () => {
    expect(parseEnv('TMUX=/tmp/tmux-501/default,1,0\nTERM=\nOS=Darwin\n')).toEqual({
      TMUX: '/tmp/tmux-501/default,1,0', TERM: '', OS: 'Darwin',
    })
  })
})
