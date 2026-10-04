// Every terminal /term knows: how to recognise it from the environment of the
// window Claude runs in, and the command that opens `dir` as a split, a tab or a window.

export type Placement = 'split' | 'tab' | 'window'

export type Env = Readonly<Record<string, string>>

type Launch = (dir: string, env: Env) => string[]

export type TerminalSpec = {
  id: string
  name: string
  detect: (env: Env) => boolean
  launch: Partial<Record<Placement, Launch>>
}

// The variables detection and the commands read; the module asks the host for exactly these.
export const ENV_NAMES = [
  'TMUX', 'ZELLIJ', 'TERM_PROGRAM', 'TERM', 'KITTY_WINDOW_ID', 'KITTY_PID', 'WEZTERM_PANE',
  'ITERM_SESSION_ID', 'GHOSTTY_RESOURCES_DIR', 'ALACRITTY_WINDOW_ID', 'GNOME_TERMINAL_SCREEN',
  'KONSOLE_VERSION',
] as const

const has = (env: Env, name: string): boolean => (env[name] ?? '') !== ''
const isMac = (env: Env): boolean => env.OS === 'Darwin'

// A launch whose terminal outlives the call and whose output never holds it open.
export const detached = (argv: readonly string[]): string[] => [
  'sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', ...argv,
]

// iTerm2 has no CLI for splits or tabs: AppleScript, the directory passed as an argument.
const iterm = (open: string): Launch => dir => [
  'osascript',
  '-e', 'on run argv',
  '-e', 'tell application "iTerm2"',
  '-e', open,
  '-e', 'tell current session of current window to write text "cd " & quoted form of (item 1 of argv) & " && clear"',
  '-e', 'end tell',
  '-e', 'end run',
  dir,
]

export const TERMINALS: readonly TerminalSpec[] = [
  // Multiplexers first: inside one, its panes beat the terminal hosting it.
  {
    id: 'tmux',
    name: 'tmux',
    detect: env => has(env, 'TMUX'),
    launch: {
      split: dir => ['tmux', 'split-window', '-h', '-c', dir],
      tab: dir => ['tmux', 'new-window', '-c', dir],
    },
  },
  {
    id: 'zellij',
    name: 'Zellij',
    detect: env => has(env, 'ZELLIJ'),
    launch: {
      split: dir => ['zellij', 'action', 'new-pane', '--direction', 'right', '--cwd', dir],
      tab: dir => ['zellij', 'action', 'new-tab', '--cwd', dir],
    },
  },
  {
    // Remote control: allow_remote_control in kitty.conf; listen_on makes it reliable.
    // --no-response: without a socket the reply comes back on the tty Claude is reading.
    id: 'kitty',
    name: 'kitty',
    detect: env => has(env, 'KITTY_WINDOW_ID') || has(env, 'KITTY_PID') || env.TERM === 'xterm-kitty',
    launch: {
      split: (dir, env) => [
        'kitten', '@', 'launch', '--no-response', '--type=window', '--location=vsplit', '--cwd', dir,
        ...(has(env, 'KITTY_WINDOW_ID') ? ['--next-to', `id:${env.KITTY_WINDOW_ID}`] : []),
      ],
      tab: dir => ['kitten', '@', 'launch', '--no-response', '--type=tab', '--cwd', dir],
      window: dir => ['kitten', '@', 'launch', '--no-response', '--type=os-window', '--cwd', dir],
    },
  },
  {
    id: 'wezterm',
    name: 'WezTerm',
    detect: env => has(env, 'WEZTERM_PANE') || env.TERM_PROGRAM === 'WezTerm',
    launch: {
      split: (dir, env) => [
        'wezterm', 'cli', 'split-pane', '--right', '--cwd', dir,
        ...(has(env, 'WEZTERM_PANE') ? ['--pane-id', env.WEZTERM_PANE ?? ''] : []),
      ],
      tab: dir => ['wezterm', 'cli', 'spawn', '--cwd', dir],
      window: dir => ['wezterm', 'cli', 'spawn', '--new-window', '--cwd', dir],
    },
  },
  {
    id: 'iterm',
    name: 'iTerm2',
    detect: env => env.TERM_PROGRAM === 'iTerm.app' || has(env, 'ITERM_SESSION_ID'),
    launch: {
      split: iterm('tell current session of current window to split vertically with default profile'),
      tab: iterm('tell current window to create tab with default profile'),
      window: dir => ['open', '-a', 'iTerm', dir],
    },
  },
  {
    id: 'ghostty',
    name: 'Ghostty',
    detect: env => env.TERM_PROGRAM === 'ghostty' || has(env, 'GHOSTTY_RESOURCES_DIR'),
    launch: {
      window: (dir, env) =>
        isMac(env)
          ? ['open', '-na', 'Ghostty', '--args', `--working-directory=${dir}`]
          : detached(['ghostty', `--working-directory=${dir}`]),
    },
  },
  {
    id: 'warp',
    name: 'Warp',
    detect: env => env.TERM_PROGRAM === 'WarpTerminal',
    launch: {
      tab: dir => ['open', `warp://action/new_tab?path=${encodeURIComponent(dir)}`],
      window: dir => ['open', `warp://action/new_window?path=${encodeURIComponent(dir)}`],
    },
  },
  {
    id: 'alacritty',
    name: 'Alacritty',
    detect: env => has(env, 'ALACRITTY_WINDOW_ID') || env.TERM === 'alacritty',
    launch: {
      window: (dir, env) =>
        isMac(env)
          ? ['open', '-na', 'Alacritty', '--args', '--working-directory', dir]
          : detached(['alacritty', '--working-directory', dir]),
    },
  },
  {
    id: 'gnome-terminal',
    name: 'GNOME Terminal',
    detect: env => has(env, 'GNOME_TERMINAL_SCREEN'),
    launch: {
      tab: dir => ['gnome-terminal', '--tab', `--working-directory=${dir}`],
      window: dir => ['gnome-terminal', '--window', `--working-directory=${dir}`],
    },
  },
  {
    id: 'konsole',
    name: 'Konsole',
    detect: env => has(env, 'KONSOLE_VERSION'),
    launch: {
      tab: dir => detached(['konsole', '--new-tab', '--workdir', dir]),
      window: dir => detached(['konsole', '--workdir', dir]),
    },
  },
  {
    id: 'terminal',
    name: 'Terminal.app',
    detect: env => env.TERM_PROGRAM === 'Apple_Terminal',
    launch: { window: dir => ['open', '-a', 'Terminal', dir] },
  },
  {
    // Last: what an unrecognised terminal (or none: the desktop app) gets.
    id: 'system',
    name: 'the default terminal',
    detect: () => true,
    launch: {
      window: (dir, env) => (isMac(env) ? ['open', '-a', 'Terminal', dir] : detached(['x-terminal-emulator'])),
    },
  },
]

export const TERMINAL_IDS = TERMINALS.map(spec => spec.id)

export const findTerminal = (id: string): TerminalSpec | undefined => TERMINALS.find(spec => spec.id === id)

export const detectTerminal = (env: Env): TerminalSpec =>
  TERMINALS.find(spec => spec.detect(env)) ?? (TERMINALS[TERMINALS.length - 1] as TerminalSpec)

const FALLBACK: Record<Placement, readonly Placement[]> = {
  split: ['split', 'tab', 'window'],
  tab: ['tab', 'split', 'window'],
  window: ['window', 'tab', 'split'],
}

export type Plan = { terminal: TerminalSpec; placement: Placement; argv: string[] }

// The asked placement, or the nearest one the terminal has.
export const planLaunch = (terminal: TerminalSpec, placement: Placement, dir: string, env: Env): Plan => {
  const chosen = FALLBACK[placement].find(one => terminal.launch[one] !== undefined) ?? 'window'
  const launch = terminal.launch[chosen] ?? (() => [])

  return { terminal, placement: chosen, argv: launch(dir, env) }
}

// A command of the person's own: argv split on spaces, {dir} the directory.
export const customPlan = (template: string, dir: string): Plan => ({
  terminal: { id: 'custom', name: 'custom command', detect: () => false, launch: {} },
  placement: 'window',
  argv: detached(template.trim().split(/\s+/).map(part => part.replaceAll('{dir}', dir))),
})
