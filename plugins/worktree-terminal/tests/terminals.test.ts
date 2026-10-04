import { describe, expect, test } from 'claude-code/testing'

import { TERMINALS, customPlan, detectTerminal, findTerminal, planLaunch } from '../hooks/terminals'
import type { Env, Placement } from '../hooks/terminals'

const DIR = '/repo/.claude/worktrees/agent fix'

// The environment each terminal gives the shell Claude runs in (as seen on macOS / Linux).
const CASES: readonly {
  id: string
  env: Env
  argv: Partial<Record<Placement, readonly string[]>>
}[] = [
  {
    id: 'tmux',
    env: { OS: 'Darwin', TMUX: '/private/tmp/tmux-501/default,812,0', TERM_PROGRAM: 'tmux', KITTY_WINDOW_ID: '1' },
    argv: {
      split: ['tmux', 'split-window', '-h', '-c', DIR],
      tab: ['tmux', 'new-window', '-c', DIR],
    },
  },
  {
    id: 'zellij',
    env: { OS: 'Linux', ZELLIJ: '0', TERM: 'xterm-256color' },
    argv: {
      split: ['zellij', 'action', 'new-pane', '--direction', 'right', '--cwd', DIR],
      tab: ['zellij', 'action', 'new-tab', '--cwd', DIR],
    },
  },
  {
    id: 'kitty',
    env: { OS: 'Darwin', TERM: 'xterm-256color', KITTY_PID: '4216', KITTY_WINDOW_ID: '3' },
    argv: {
      split: ['kitten', '@', 'launch', '--no-response', '--type=window', '--location=vsplit', '--cwd', DIR, '--next-to', 'id:3'],
      tab: ['kitten', '@', 'launch', '--no-response', '--type=tab', '--cwd', DIR],
      window: ['kitten', '@', 'launch', '--no-response', '--type=os-window', '--cwd', DIR],
    },
  },
  {
    id: 'wezterm',
    env: { OS: 'Darwin', TERM_PROGRAM: 'WezTerm', WEZTERM_PANE: '7' },
    argv: {
      split: ['wezterm', 'cli', 'split-pane', '--right', '--cwd', DIR, '--pane-id', '7'],
      tab: ['wezterm', 'cli', 'spawn', '--cwd', DIR],
      window: ['wezterm', 'cli', 'spawn', '--new-window', '--cwd', DIR],
    },
  },
  {
    id: 'iterm',
    env: { OS: 'Darwin', TERM_PROGRAM: 'iTerm.app', ITERM_SESSION_ID: 'w0t0p0:ABC' },
    argv: { window: ['open', '-a', 'iTerm', DIR] },
  },
  {
    id: 'ghostty',
    env: { OS: 'Darwin', TERM_PROGRAM: 'ghostty', GHOSTTY_RESOURCES_DIR: '/Applications/Ghostty.app/Contents/Resources/ghostty' },
    argv: { window: ['open', '-na', 'Ghostty', '--args', `--working-directory=${DIR}`] },
  },
  {
    id: 'warp',
    env: { OS: 'Darwin', TERM_PROGRAM: 'WarpTerminal' },
    argv: {
      tab: ['open', `warp://action/new_tab?path=${encodeURIComponent(DIR)}`],
      window: ['open', `warp://action/new_window?path=${encodeURIComponent(DIR)}`],
    },
  },
  {
    id: 'alacritty',
    env: { OS: 'Linux', TERM: 'alacritty', ALACRITTY_WINDOW_ID: '94' },
    argv: { window: ['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', 'alacritty', '--working-directory', DIR] },
  },
  {
    id: 'gnome-terminal',
    env: { OS: 'Linux', TERM: 'xterm-256color', GNOME_TERMINAL_SCREEN: '/org/gnome/Terminal/screen/1' },
    argv: {
      tab: ['gnome-terminal', '--tab', `--working-directory=${DIR}`],
      window: ['gnome-terminal', '--window', `--working-directory=${DIR}`],
    },
  },
  {
    id: 'konsole',
    env: { OS: 'Linux', TERM: 'xterm-256color', KONSOLE_VERSION: '240802' },
    argv: { tab: ['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', 'konsole', '--new-tab', '--workdir', DIR] },
  },
  {
    id: 'terminal',
    env: { OS: 'Darwin', TERM_PROGRAM: 'Apple_Terminal' },
    argv: { window: ['open', '-a', 'Terminal', DIR] },
  },
  {
    id: 'system',
    env: { OS: 'Linux', TERM: 'xterm-256color' },
    argv: { window: ['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', 'x-terminal-emulator'] },
  },
]

describe('every terminal', () => {
  test('has a case here', async () => {
    expect(TERMINALS.map(spec => spec.id).sort()).toEqual(CASES.map(one => one.id).sort())
  })

  for (const { id, env, argv } of CASES) {
    test(`${id}: detected from its environment`, async () => {
      expect(detectTerminal(env).id).toBe(id)
    })

    test(`${id}: launch commands`, async () => {
      const spec = findTerminal(id)
      expect(spec).toBeDefined()
      for (const [placement, expected] of Object.entries(argv)) {
        const plan = planLaunch(spec!, placement as Placement, DIR, env)
        expect(plan.placement).toBe(placement)
        expect(plan.argv).toEqual([...expected])
      }
    })

    test(`${id}: every placement lands somewhere`, async () => {
      for (const placement of ['split', 'tab', 'window'] as const) {
        expect(planLaunch(findTerminal(id)!, placement, DIR, env).argv.length).toBeGreaterThan(0)
      }
    })
  }
})

describe('fallbacks', () => {
  test('a split falls back to a tab, then a window', async () => {
    expect(planLaunch(findTerminal('warp')!, 'split', DIR, { OS: 'Darwin' }).placement).toBe('tab')
    expect(planLaunch(findTerminal('ghostty')!, 'split', DIR, { OS: 'Darwin' }).placement).toBe('window')
  })

  test('a window falls back to a tab in a multiplexer', async () => {
    expect(planLaunch(findTerminal('tmux')!, 'window', DIR, {}).placement).toBe('tab')
  })

  test('kitty without a window id splits the active window', async () => {
    expect(planLaunch(findTerminal('kitty')!, 'split', DIR, { KITTY_PID: '1' }).argv).not.toContain('--next-to')
  })

  test('iTerm2 splits through AppleScript, the directory as an argument', async () => {
    const { argv } = planLaunch(findTerminal('iterm')!, 'split', DIR, { OS: 'Darwin' })
    expect(argv[0]).toBe('osascript')
    expect(argv.join(' ')).toContain('split vertically')
    expect(argv.at(-1)).toBe(DIR)
  })

  test('a custom command fills {dir}', async () => {
    expect(customPlan('alacritty --working-directory {dir}', '/w').argv.slice(-3))
      .toEqual(['alacritty', '--working-directory', '/w'])
  })
})
