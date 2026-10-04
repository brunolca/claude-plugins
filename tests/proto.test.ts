import { expect, test } from 'claude-code/testing'
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const ROOT = '/work/app'
const LOCAL = `${ROOT}/.claude/settings.local.json`
const PROJECT = `${ROOT}/.claude/settings.json`
const INPUT = {
  model: 'm',
  promptModel: 'm',
  surfaces: [],
  tools: [],
  outputStyle: null,
  traits: [],
} as const

// An in-memory project: settings files on disk, merged the way the engine does.
const world = (on: On, files: Record<string, string> = {}, env?: string) => {
  const parse = (path: string) => JSON.parse(files[path] ?? '{}') as Record<string, unknown>
  on('session.root', () => ({ value: ROOT }))
  on('env.get', () => ({ value: env }))
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }))
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('settings.read', ($, e) => {
    if (e.source === 'local') return { value: parse(LOCAL) }
    if (e.source === 'project') return { value: parse(PROJECT) }
    const merged = { ...parse(PROJECT), ...parse(LOCAL) } as Record<string, unknown>
    const worktree = { ...(parse(PROJECT).worktree as object), ...(parse(LOCAL).worktree as object) }
    return { value: { ...merged, worktree } }
  })
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))

  return files
}

const proto = (args: string): CommandRunInput => ({
  command: 'proto',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
})

const sectionIds = async ($: Engine) => (await $.prompt.compose(INPUT)).sections.map(s => s.id)

test('off by default: worktrees allowed, no prompt section', async ($, on) => {
  world(on)
  expect(await sectionIds($)).toEqual(['intro'])
  const ran = await $.tool.call({ tool: 'EnterWorktree', name: 'x' })
  expect(ran.deny).toBeUndefined()
})

test('/proto on sets bgIsolation none locally, keeping other settings', async ($, on) => {
  const files = world(on, { [LOCAL]: JSON.stringify({ model: 'opus', worktree: { baseRef: 'head' } }) })
  await $.command.run(proto('on'))
  expect(JSON.parse(files[LOCAL] ?? '')).toEqual({
    model: 'opus',
    worktree: { baseRef: 'head', bgIsolation: 'none' },
  })
  expect(await sectionIds($)).toEqual(['intro', 'prototype-mode:rules'])
  const ran = await $.tool.call({ tool: 'EnterWorktree', name: 'x' })
  expect(ran.deny).toContain('Prototype mode')
})

test('/proto on team writes the shared settings file', async ($, on) => {
  const files = world(on)
  await $.command.run(proto('on team'))
  expect(JSON.parse(files[PROJECT] ?? '')).toEqual({ worktree: { bgIsolation: 'none' } })
  expect(files[LOCAL]).toBeUndefined()
})

test('/proto off removes the key, and overrides a team "none" locally', async ($, on) => {
  const files = world(on, {
    [PROJECT]: JSON.stringify({ worktree: { bgIsolation: 'none' } }),
    [LOCAL]: JSON.stringify({ worktree: { bgIsolation: 'none' } }),
  })
  await $.command.run(proto('off'))
  expect(JSON.parse(files[LOCAL] ?? '')).toEqual({ worktree: { bgIsolation: 'worktree' } })
  expect(await sectionIds($)).toEqual(['intro'])
})

test('CLAUDE_BG_ISOLATION outranks the settings files', async ($, on) => {
  world(on, { [LOCAL]: JSON.stringify({ worktree: { bgIsolation: 'none' } }) }, 'worktree')
  expect(await sectionIds($)).toEqual(['intro'])
})

test('strips worktree isolation from Agent calls when on', async ($, on) => {
  let seen: unknown = 'unset'
  on('tool.call', { tool: 'Agent' }, ($, e) => {
    seen = e.isolation
    return { result: 'ok', text: 'ok' }
  })
  world(on, { [LOCAL]: JSON.stringify({ worktree: { bgIsolation: 'none' } }) })
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd', isolation: 'worktree' })
  expect(seen).toBeUndefined()
})
