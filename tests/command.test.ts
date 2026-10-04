import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PORCELAIN } from './fixtures'

const RUN = {
  command: 'term',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const ok = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// Stands in for the host: the repo's worktrees, the terminal's environment, and records launches.
const host = (on: On, env: string, exitCode = 0) => {
  const launched: string[][] = []
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'git') return ok(PORCELAIN)
    if (e.argv[0] === 'sh' && e.argv[2]?.startsWith('for v in')) return ok(`${env}\nOS=Darwin\n`)
    launched.push([...e.argv])

    return exitCode === 0
      ? ok('')
      : { value: { exitCode, stdout: '', stderr: 'Error: open /dev/tty', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return launched
}

test('/term splits kitty next to the Claude window', async ($, on) => {
  const launched = host(on, 'KITTY_PID=4216\nKITTY_WINDOW_ID=3')
  const { text } = await $.command.run({ ...RUN, args: '' })
  expect(launched).toEqual([
    ['kitten', '@', 'launch', '--no-response', '--type=window', '--location=vsplit', '--cwd', '/repo', '--next-to', 'id:3'],
  ])
  expect(text).toBe('Opened a kitty split in /repo')
})

test('/term <name> --tab opens an agent worktree in a tmux window', async ($, on) => {
  const launched = host(on, 'TMUX=/tmp/tmux-501/default,1,0\nKITTY_PID=4216')
  await $.command.run({ ...RUN, args: 'fix-login --tab' })
  expect(launched).toEqual([['tmux', 'new-window', '-c', '/repo/.claude/worktrees/agent-fix-login']])
})

test('/term says when a terminal cannot split', async ($, on) => {
  host(on, 'TERM_PROGRAM=ghostty')
  const { text } = await $.command.run({ ...RUN, args: '' })
  expect(text).toBe('Opened a Ghostty window in /repo (Ghostty cannot open a split from outside)')
})

test('/term explains a refused kitty launch', async ($, on) => {
  host(on, 'KITTY_PID=4216', 1)
  const { text } = await $.command.run({ ...RUN, args: '' })
  expect(text).toContain('Could not open kitty in /repo: Error: open /dev/tty')
  expect(text).toContain('listen_on')
})

test('the configured terminal and placement win over detection', { options: { terminal: 'wezterm', placement: 'window' } }, async ($, on) => {
  const launched = host(on, 'KITTY_PID=4216')
  await $.command.run({ ...RUN, args: 'docs' })
  expect(launched).toEqual([['wezterm', 'cli', 'spawn', '--new-window', '--cwd', '/repo/.claude/worktrees/docs']])
})

test('a custom command runs with {dir}', { options: { terminal: 'custom', customCommand: 'foot -D {dir}' } }, async ($, on) => {
  const launched = host(on, '')
  await $.command.run({ ...RUN, args: 'main' })
  expect(launched.at(-1)?.slice(-3)).toEqual(['foot', '-D', '/repo'])
})
