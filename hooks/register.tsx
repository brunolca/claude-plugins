import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Worktree } from '../types'
import { findWorktree, label, parseEnv, parseWorktrees } from './lib'
import { ENV_NAMES, customPlan, detectTerminal, findTerminal, planLaunch } from './terminals'
import type { Placement, Plan } from './terminals'

const worktrees = atom({ plugin: 'worktree-terminal', key: 'worktrees' } as const, [])
const isHidden = atom({ plugin: 'worktree-terminal', key: 'isHidden' } as const, false)

// Prints NAME=value for each name it is given, then the OS.
const ENV_PROBE = 'for v in "$@"; do printf "%s=%s\\n" "$v" "$(printenv "$v")"; done; printf "OS=%s\\n" "$(uname)"'

const PLACEMENTS: readonly Placement[] = ['split', 'tab', 'window']

const HINTS: Record<string, string> = {
  kitty: 'kitty needs `allow_remote_control yes` in kitty.conf; add `listen_on unix:/tmp/kitty` too, then restart kitty.',
  wezterm: 'Is the `wezterm` CLI on PATH?',
  iterm: 'Allow Claude Code to control iTerm2 under System Settings › Privacy & Security › Automation.',
}

type Config = { terminal: string; placement: Placement; customCommand: string }

async function readEnv($: EngineInterface): Promise<Record<string, string>> {
  const { stdout } = await $.process.run(['sh', '-c', ENV_PROBE, 'sh', ...ENV_NAMES])

  return parseEnv(stdout)
}

async function refresh($: EngineInterface): Promise<Worktree[]> {
  const cwd = await $.session.cwd()
  const found = await $.process
    .run(['git', 'worktree', 'list', '--porcelain'], { cwd })
    .then(ran => (ran.exitCode === 0 ? parseWorktrees(ran.stdout) : []))
    .catch(() => [])
  await update($, worktrees, () => found)

  return found
}

async function plan($: EngineInterface, config: Config, placement: Placement, dir: string): Promise<Plan | string> {
  if (config.terminal === 'custom') {
    return config.customCommand.trim() === ''
      ? 'Terminal app is "custom" but Custom command is empty: set it in /config.'
      : customPlan(config.customCommand, dir)
  }
  const env = await readEnv($)
  const terminal = config.terminal === 'auto' ? detectTerminal(env) : findTerminal(config.terminal)

  return terminal === undefined ? `Unknown terminal "${config.terminal}"` : planLaunch(terminal, placement, dir, env)
}

async function openTerminal($: EngineInterface, config: Config, dir: string, asked?: Placement): Promise<string> {
  const placement = asked ?? config.placement
  const planned = await plan($, config, placement, dir)
  if (typeof planned === 'string') return planned

  const { terminal } = planned
  const ran = await $.process
    .run(planned.argv, { cwd: dir, timeoutMs: 10_000 })
    .catch((error: unknown) => ({ exitCode: 1, stderr: String(error) }))
  if (ran.exitCode !== 0) {
    const hint = HINTS[terminal.id]

    return `Could not open ${terminal.name} in ${dir}: ${ran.stderr.trim() || `exit ${ran.exitCode}`}` +
      (hint === undefined ? '' : `\n${hint}`)
  }
  const fellBack = planned.placement === placement ? '' : ` (${terminal.name} cannot open a ${placement} from outside)`

  return `Opened a ${terminal.name} ${planned.placement} in ${dir}${fellBack}`
}

const listing = (list: readonly Worktree[], cwd: string): string =>
  list
    .map(
      (one, i) =>
        `${i + 1}. ${label(one)}${one.branch ? ` [${one.branch}]` : ''}${one.isAgent ? ' (agent)' : ''}` +
        `${one.path === cwd ? ' ← current' : ''}\n   ${one.path}`,
    )
    .join('\n')

// `/term [target] [--split|--tab|--window]`
const parseArgs = (args: string): { query: string; placement?: Placement } => {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const placement = PLACEMENTS.find(one => words.includes(`--${one}`))

  return { query: words.filter(word => !word.startsWith('--')).join(' '), placement }
}

export const register: Register = (on, options) => {
  const placement = String(options.placement ?? 'split')
  const config: Config = {
    terminal: String(options.terminal ?? 'auto'),
    placement: PLACEMENTS.find(one => one === placement) ?? 'split',
    customCommand: String(options.customCommand ?? ''),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'term',
      description: 'Open a terminal in the current worktree, or in another one (agents included)',
      argumentHint: '[list | main | <n> | <name>] [--split | --tab | --window]',
      immediate: true,
    })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'term' }, async ($, e) => {
    const { query, placement: asked } = parseArgs(e.args)
    const cwd = await $.session.cwd()
    if (query === '') {
      return { text: await openTerminal($, config, cwd, asked) }
    }
    const list = await refresh($)
    if (query === 'list' || query === 'ls') {
      return { text: list.length === 0 ? `No git worktrees under ${cwd}` : listing(list, cwd) }
    }
    const target = findWorktree(list, query)

    return target === undefined
      ? { text: `No worktree matches "${query}".\n${listing(list, cwd)}` }
      : { text: await openTerminal($, config, target.path, asked) }
  })

  // Agents create and remove worktrees: keep the list fresh around them.
  on('tool.call', { tool: ['Agent', 'EnterWorktree', 'ExitWorktree'] }, async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const agents = (await read($, worktrees)).filter(one => one.isAgent)
    if (e.props.hasSurvey || agents.length === 0 || (await read($, isHidden))) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box gap={1}>
        <Text dimColor>Agent worktrees:</Text>
        {agents.slice(0, 6).map(one => (
          <Button
            key={`open:${one.path}`}
            label={`▸ ${label(one)}`}
            onPress={async () => $.ui.toast(await openTerminal($, config, one.path))}
          />
        ))}
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
