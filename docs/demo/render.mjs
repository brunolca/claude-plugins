// Renders the README demo GIFs: each frame is an HTML mockup of a Claude Code
// session, screenshotted by headless Chrome and assembled by ffmpeg.
//   node docs/demo/render.mjs [prototype-mode|worktree-terminal]
// Needs Google Chrome and ffmpeg. Output: docs/<name>.gif
import { execFile, spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const W = 960
const H = 560

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { width: ${W}px; height: ${H}px; background: #0d1117; overflow: hidden }
body { padding: 18px; font: 14px/1.5 Menlo, 'SF Mono', monospace; color: #d4d4d4 }
.win { height: 100%; background: #1a1a1a; border-radius: 10px; border: 1px solid #333;
  box-shadow: 0 12px 40px #0008; display: flex; flex-direction: column; overflow: hidden }
.bar { height: 30px; display: flex; align-items: center; padding: 0 12px; gap: 8px;
  background: #262626; border-bottom: 1px solid #333; color: #888; font-size: 12px }
.dot { width: 12px; height: 12px; border-radius: 50% }
.title { flex: 1; text-align: center; margin-right: 52px }
.panes { flex: 1; display: flex; min-height: 0 }
.pane { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; min-width: 0 }
.pane + .pane, .stack .pane { border-left: 1px solid #3a3a3a; background: #161616 }
.log { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; overflow: hidden }
.l { white-space: pre-wrap; word-break: break-word }
.nowrap .l { white-space: pre; overflow: hidden }
.btn, .btns { white-space: nowrap }
.claude.split { flex: 0 0 56% }
.stack { flex: 1; display: flex; flex-direction: column; border-left: 1px solid #3a3a3a; min-width: 0 }
.stack .pane { border-left: 0 }
.stack .pane + .pane, .stack .pane { border-top: 1px solid #3a3a3a }
.dim { color: #7a7a7a } .or { color: #d77757 } .gr { color: #7ec27e } .rd { color: #e06c75 }
.bl { color: #6cb6ff } .ye { color: #e5c07b } .b { font-weight: bold; color: #eee }
.inset { padding-left: 2ch } .inset2 { padding-left: 5ch }
.user { color: #aaa } .user b { color: #ddd; font-weight: normal }
.box { border: 1px solid #555; border-radius: 6px; padding: 6px 10px; margin-top: 10px }
.cur { display: inline-block; width: 0.6em; background: #ddd; color: #ddd }
.status { display: flex; justify-content: space-between; padding: 4px 2px 0; color: #7a7a7a; font-size: 13px }
.menu { padding: 4px 12px 0 }
.menu .sel { color: #b7a1f5 }
.btns { display: flex; gap: 10px; align-items: center; padding-top: 10px; font-size: 13px }
.btn { border: 1px solid #555; border-radius: 4px; padding: 0 8px; color: #ccc }
.btn.hot { border-color: #d77757; color: #fff; background: #d7775733 }
.shell .l { line-height: 1.6 }
.spin { color: #d77757 }
.g1 { display: inline-block; width: 1ch; overflow: hidden; vertical-align: bottom }
`

const page = (title, panes) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span>
<span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
<span class="title">${esc(title)}</span></div><div class="panes">${panes.join('')}</div></div>`

const cursor = '<span class="cur">&nbsp;</span>'

// A Claude Code pane: transcript lines, the prompt box, an optional slash menu,
// a row above the prompt and the status line.
const claude = ({ log = [], input = '', typing = true, menu, above, left = '', right = '', split = false }) => `
<div class="pane claude${split ? ' split nowrap' : ''}"><div class="log">${log.map(l => `<div class="l">${l}</div>`).join('')}</div>
${above ?? ''}
<div class="box"><span class="dim">&gt; </span>${esc(input)}${typing ? cursor : ''}</div>
${menu ? `<div class="menu">${menu}</div>` : ''}
<div class="status"><span>${left}</span><span>${right}</span></div></div>`

const shell = lines => `<div class="pane shell"><div class="log" style="justify-content:flex-start">${lines
  .map(l => `<div class="l">${l}</div>`)
  .join('')}</div></div>`

const stack = panes => `<div class="stack">${panes.join('')}</div>`

const you = text => `<span class="user"><span class="dim">&gt;</span> <b>${esc(text)}</b></span>`
const out = text => `<span class="dim">&nbsp;&nbsp;<span class="g1">⎿</span>&nbsp;&nbsp;</span>${text}`
const tool = (name, arg) => `<span class="gr">⏺</span> <span class="b">${name}</span>(${esc(arg)})`
const say = text => `<span class="b">⏺</span> ${text}`

// Frames: [html, ms]. `typed` adds one frame per character.
function timeline() {
  const frames = []
  const add = (html, ms) => frames.push([html, ms])
  const typed = (text, render, ms = 55) => {
    for (let i = 0; i <= text.length; i++) add(render(text.slice(0, i)), ms)
  }

  return { frames, add, typed }
}

function prototypeMode() {
  const { frames, add, typed } = timeline()
  const title = 'claude — ~/acme-app'
  const left = '~/acme-app · <span class="bl">main</span>'
  const ON = '<span class="ye">🧪 prototype mode</span>'
  const menu = '<span class="sel">/proto</span>  <span class="dim">Prototype mode (no worktrees, work on main): /proto [on|off|status] [team]</span>'
  const welcome = [
    '<span class="or">✻</span> <span class="b">Welcome to Claude Code</span>',
    '<span class="dim">  ~/acme-app</span>',
    '',
  ]

  add(page(title, [claude({ log: welcome, left })]), 900)
  typed('/proto on', s => page(title, [claude({ log: welcome, input: s, left, menu: s.startsWith('/') ? menu : '' })]))
  add(page(title, [claude({ log: welcome, input: '/proto on', left, menu })]), 500)

  const log1 = [
    ...welcome,
    you('/proto on'),
    out('Prototype mode ON: set worktree.bgIsolation "none" in\n     <span class="dim">~/acme-app/.claude/settings.local.json</span>. Background jobs\n     now edit this checkout directly.'),
    '',
  ]
  add(page(title, [claude({ log: log1, left, right: ON })]), 1800)

  const ask = 'add a dark mode toggle to the settings page'
  typed(ask, s => page(title, [claude({ log: log1, input: s, left, right: ON })]), 35)
  add(page(title, [claude({ log: log1, input: ask, left, right: ON })]), 400)

  const steps = [
    you(ask),
    say('I\'ll add it straight on <span class="bl">main</span>, no worktree.'),
    tool('Update', 'src/settings/Appearance.tsx'),
    out('Updated with <span class="gr">18 additions</span> and <span class="rd">2 removals</span>'),
    tool('Bash', 'npm test -- settings'),
    out('<span class="gr">✓</span> 14 passed'),
    tool('Bash', 'git commit -am "Add dark mode toggle"'),
    out('[<span class="bl">main</span> 3f2a1c9] Add dark mode toggle'),
    say('Done: committed on <span class="bl">main</span>. Want me to push?'),
  ]
  const spinner = n => `<span class="spin">✻</span> <span class="or">Prototyping…</span> <span class="dim">(${n}s · esc to interrupt)</span>`
  for (let i = 1; i <= steps.length; i++) {
    const done = i === steps.length
    const log = [...log1, ...steps.slice(0, i), ...(done ? [] : [spinner(i)])]
    add(page(title, [claude({ log, left, right: ON, typing: done })]), i === 1 ? 500 : done ? 3500 : 650)
  }

  return frames
}

function worktreeTerminal() {
  const { frames, add, typed } = timeline()
  const title = 'kitty — ~/acme-app'
  const left = '~/acme-app · <span class="bl">main</span>'
  const menu = '<span class="sel">/term</span>  <span class="dim">Open a terminal in the current worktree, or in another one (agents included)</span>'
  const above = hot =>
    `<div class="btns"><span class="dim">Agent worktrees:</span>` +
    ['agent-a1f3', 'agent-7c2e'].map((n, i) => `<span class="btn${hot === i ? ' hot' : ''}">▸ ${n}</span>`).join('') +
    `<span class="btn">Hide</span></div>`

  const log1 = [
    you('fix the flaky checkout test and bump the API client, in parallel'),
    tool('Agent', 'Fix flaky checkout test · worktree'),
    out('Done: retries removed, waits on the network idle event'),
    tool('Agent', 'Bump API client to v4 · worktree'),
    out('Done: 6 files changed, tests pass'),
    say('Both agents finished, each in its own worktree.'),
    '',
  ]
  add(page(title, [claude({ log: log1, left, above: above() })]), 1600)

  typed('/term list', s =>
    page(title, [claude({ log: log1, input: s, left, above: above(), menu: s.startsWith('/') ? menu : '' })]),
  )
  add(page(title, [claude({ log: log1, input: '/term list', left, above: above(), menu })]), 400)

  const list = [
    you('/term list'),
    out(`1. acme-app [<span class="bl">main</span>] <span class="dim">← current</span>
       <span class="dim">~/acme-app</span>
     2. agent-a1f3 [<span class="bl">worktree-agent-a1f3</span>] <span class="ye">(agent)</span>
       <span class="dim">~/acme-app/.claude/worktrees/agent-a1f3</span>
     3. agent-7c2e [<span class="bl">worktree-agent-7c2e</span>] <span class="ye">(agent)</span>
       <span class="dim">~/acme-app/.claude/worktrees/agent-7c2e</span>`),
    '',
  ]
  const log2 = [...log1.slice(5), ...list]
  add(page(title, [claude({ log: log2, left, above: above() })]), 2400)

  typed('/term 2', s => page(title, [claude({ log: log2, input: s, left, above: above() })]))
  add(page(title, [claude({ log: log2, input: '/term 2', left, above: above() })]), 400)

  const opened = [
    you('/term 2'),
    out('Opened a kitty split in\n     <span class="dim">.claude/worktrees/agent-a1f3</span>'),
    '',
  ]
  const log3 = [...log2.slice(-4), ...opened]
  const prompt1 = '<span class="gr">agent-a1f3</span> <span class="dim">$</span> '
  const sh = [prompt1]
  add(page(title, [claude({ log: log3, left, above: above(), split: true }), shell([sh[0] + cursor])]), 900)
  const cmd = 'git diff --stat'
  typed(cmd, s => page(title, [claude({ log: log3, left, above: above(), split: true }), shell([prompt1 + esc(s) + cursor])]))
  const diff = [
    prompt1 + esc(cmd),
    ' e2e/checkout.spec.ts | <span class="gr">9 ++++</span><span class="rd">--</span>',
    ' e2e/helpers/wait.ts  | <span class="gr">14 +++++++</span>',
    ' 2 files changed, <span class="gr">19 (+)</span>, <span class="rd">4 (-)</span>',
    prompt1 + cursor,
  ]
  add(page(title, [claude({ log: log3, left, above: above(), split: true }), shell(diff)]), 2600)

  // The button row opens the other agent's worktree with one click.
  add(page(title, [claude({ log: log3, left, above: above(1), split: true }), shell(diff)]), 700)
  const prompt2 = '<span class="gr">agent-7c2e</span> <span class="dim">$</span> '
  const toast = `<div class="l"><span class="dim">  Opened a kitty split in .claude/worktrees/agent-7c2e</span></div>`
  const log4 = [...log3, toast]
  add(page(title, [claude({ log: log4, left, above: above(), split: true }), stack([shell(diff), shell([prompt2 + cursor])])]), 3200)

  return frames
}

// One headless Chrome, driven over the DevTools protocol.
async function chrome(dir) {
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0',
    `--user-data-dir=${join(dir, 'profile')}`, 'about:blank',
  ])
  const port = await new Promise((resolve, reject) => {
    let err = ''
    proc.stderr.on('data', chunk => {
      err += chunk
      const found = err.match(/ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (found) resolve(found[1])
    })
    proc.on('exit', () => reject(new Error(`Chrome exited: ${err}`)))
  })
  const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(t => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
  let id = 0
  const pending = new Map()
  const waiters = []
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id !== undefined) pending.get(msg.id)?.(msg.result)
    else waiters.filter(w => w.method === msg.method).forEach(w => w.resolve())
  })
  const send = (method, params = {}) =>
    new Promise(resolve => {
      pending.set(++id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  const once = method => new Promise(resolve => waiters.push({ method, resolve }))
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })

  return {
    async shoot(url) {
      const loaded = once('Page.loadEventFired')
      await send('Page.navigate', { url })
      await loaded
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      waiters.length = 0

      return Buffer.from(data, 'base64')
    },
    close: () => (ws.close(), proc.kill()),
  }
}

const DEMOS = { 'prototype-mode': prototypeMode, 'worktree-terminal': worktreeTerminal }

async function render(name) {
  const dir = join(HERE, '.frames', name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const frames = DEMOS[name]()

  // Screenshot unique frames only.
  const unique = [...new Set(frames.map(([html]) => html))]
  const pngOf = html => join(dir, `${unique.indexOf(html)}.png`)
  const browser = await chrome(dir)
  try {
    for (const [i, html] of unique.entries()) {
      const file = join(dir, `${i}.html`)
      writeFileSync(file, html)
      writeFileSync(join(dir, `${i}.png`), await browser.shoot(`file://${file}`))
    }
  } finally {
    browser.close()
  }

  const list = frames.map(([html, ms]) => `file '${pngOf(html)}'\nduration ${ms / 1000}`).join('\n')
  writeFileSync(join(dir, 'list.txt'), `${list}\nfile '${pngOf(frames.at(-1)[0])}'\n`)
  const gif = join(OUT, `${name}.gif`)
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
    '-vf', `scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    '-fps_mode', 'vfr', gif,
  ])
  rmSync(dir, { recursive: true, force: true })
  console.log(`${gif}: ${frames.length} frames, ${unique.length} unique`)
}

for (const name of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(DEMOS)) await render(name)
