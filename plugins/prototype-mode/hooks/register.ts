import type { EngineInterface, Register, Settings } from 'claude-code'

// Prototype mode is the engine's own `worktree.bgIsolation: "none"` setting:
// with it, background jobs may edit the main checkout directly instead of
// being blocked until they call EnterWorktree. `/proto on` writes it to the
// project's .claude/settings.local.json (just you) or, with `team`, to
// .claude/settings.json (commit it to share). This plugin adds the rest:
// it tells the model, refuses EnterWorktree and drops subagent isolation.
const STATUS = '🧪 prototype mode'

// Only about worktrees: any wording about pace or workflow leaks into how the
// model reasons and makes it shallower.
const PROMPT = `# No worktrees
This project works directly in the current checkout instead of in git worktrees. Editing here is allowed in background sessions too: don't call EnterWorktree before editing, and don't create worktrees unless the user asks for one.`

type Isolation = 'none' | 'worktree'
type Where = 'local' | 'project'

const FILES: Record<Where, string> = {
  local: '.claude/settings.local.json',
  project: '.claude/settings.json',
}

const isolationOf = (settings: Settings): Isolation | undefined => {
  const worktree = settings.worktree as { bgIsolation?: unknown } | undefined
  const value = worktree?.bgIsolation

  return value === 'none' || value === 'worktree' ? value : undefined
}

// The env var outranks every settings file, as it does for the engine's guard.
const effective = async ($: EngineInterface): Promise<Isolation> => {
  const env = await $.env.get('CLAUDE_BG_ISOLATION')
  if (env === 'none' || env === 'worktree') return env

  return isolationOf(await $.settings.read()) ?? 'worktree'
}

const isOn = async ($: EngineInterface) => (await effective($)) === 'none'

const readJson = async ($: EngineInterface, path: string) => {
  if (!(await $.fs.exists(path))) return {}
  const parsed: unknown = JSON.parse(await $.fs.read(path))

  return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}

// Sets (or, with undefined, removes) worktree.bgIsolation in one settings file,
// keeping everything else in it.
const writeIsolation = async ($: EngineInterface, where: Where, value: Isolation | undefined) => {
  const path = `${await $.session.root()}/${FILES[where]}`
  const settings = await readJson($, path)
  const { bgIsolation: _old, ...worktree } = (settings.worktree ?? {}) as Record<string, unknown>
  const next = value === undefined ? worktree : { ...worktree, bgIsolation: value }
  const { worktree: _was, ...rest } = settings
  const out = Object.keys(next).length === 0 ? rest : { ...rest, worktree: next }
  await $.fs.write(path, `${JSON.stringify(out, null, 2)}\n`)

  return path
}

const refreshStatus = async ($: EngineInterface) => $.ui.status((await isOn($)) ? STATUS : undefined)

const describe = async ($: EngineInterface) => {
  const root = await $.session.root()
  const env = await $.env.get('CLAUDE_BG_ISOLATION')
  const local = isolationOf(await $.settings.read({ source: 'local' }))
  const project = isolationOf(await $.settings.read({ source: 'project' }))
  const lines = [
    `Prototype mode is ${(await isOn($)) ? 'ON' : 'OFF'} for ${root}.`,
    `  ${FILES.local}: ${local ?? 'unset'}`,
    `  ${FILES.project}: ${project ?? 'unset'}`,
  ]
  if (env !== undefined) lines.push(`  CLAUDE_BG_ISOLATION=${env} (outranks both files)`)

  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'proto',
      description: 'Prototype mode (no worktrees, work on main): /proto [on|off|status] [team]',
    })
    await refreshStatus($)

    return next(e)
  })

  on('command.run', { command: 'proto' }, async ($, e) => {
    const [verb = 'status', scope] = e.args.trim().toLowerCase().split(/\s+/)
    const isTeam = scope === 'team'

    if (verb === 'status' || verb === '') return { text: await describe($) }
    if ((verb !== 'on' && verb !== 'off') || (scope !== undefined && !isTeam)) {
      return { text: 'Usage: /proto [on|off|status] [team]' }
    }

    try {
      if (verb === 'on') {
        const path = await writeIsolation($, isTeam ? 'project' : 'local', 'none')
        // A personal "worktree" left in the local file would outrank a team "none".
        if (isTeam && isolationOf(await $.settings.read({ source: 'local' })) === 'worktree') {
          await writeIsolation($, 'local', undefined)
        }
        await refreshStatus($)
        const text = `Prototype mode ON: set worktree.bgIsolation "none" in ${path}. Background jobs now edit this checkout directly.${isTeam ? ' Commit that file to share it.' : ''}`

        return { text, context: [text] }
      }

      // off: clear ours; if the team file still says "none", override it locally.
      await writeIsolation($, isTeam ? 'project' : 'local', undefined)
      const isStillNone = isolationOf(await $.settings.read({ source: 'project' })) === 'none'
      if (!isTeam && isStillNone) await writeIsolation($, 'local', 'worktree')
      await refreshStatus($)
      const text = `Prototype mode OFF: background jobs isolate in worktrees again.${!isTeam && isStillNone ? ` (${FILES.project} still says "none"; overridden in ${FILES.local}.)` : ''}`

      return { text, context: [text] }
    } catch (error) {
      return { text: `Could not update settings: ${String(error)}` }
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await isOn($))) return composed

    return {
      sections: [
        ...composed.sections,
        { id: 'prototype-mode:rules', text: PROMPT, scope: 'session' },
      ],
    }
  })

  on('tool.call', { tool: 'EnterWorktree' }, async ($, e, next) =>
    (await isOn($))
      ? {
          deny: 'Prototype mode is on for this project: do not create a worktree. Keep working directly in the current checkout on the current branch; edits there are allowed.',
        }
      : next(e),
  )

  // Subagents run in the shared checkout too.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.isolation !== 'worktree' || !(await isOn($))) return next(e)
    const { isolation: _dropped, ...rest } = e

    return next(rest)
  })
}
