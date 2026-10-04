# prototype-mode

A Claude Code plugin that flags a project for **prototype mode**: no git worktrees, iterate and commit directly on the current branch (main included). Works for interactive sessions and background jobs.

![prototype-mode demo: /proto on, then Claude edits, tests and commits directly on main](https://raw.githubusercontent.com/brunolca/claude-plugins/main/docs/prototype-mode.gif)

## Install

```sh
claude plugin marketplace add brunolca/claude-plugins
claude plugin install prototype-mode@brunolca
```

Or from inside Claude Code: `/plugin marketplace add brunolca/claude-plugins`, then `/plugin install prototype-mode@brunolca`.

### Share it with a team (per repo)

Commit this to the project's `.claude/settings.json` so everyone who trusts the repo is offered the plugin, and prototype mode is on for all of them:

```json
{
  "extraKnownMarketplaces": {
    "brunolca": {
      "source": { "source": "github", "repo": "brunolca/claude-plugins" }
    }
  },
  "enabledPlugins": { "prototype-mode@brunolca": true },
  "worktree": { "bgIsolation": "none" }
}
```

`/proto on team` writes the `worktree` part for you.

## Commands

| Command | Effect |
| --- | --- |
| `/proto on` | Sets `worktree.bgIsolation: "none"` in `.claude/settings.local.json` (just you) |
| `/proto on team` | Same, in `.claude/settings.json` (commit it to share) |
| `/proto off [team]` | Removes it; a team `"none"` is overridden locally with `"worktree"` |
| `/proto` / `/proto status` | Shows the effective mode and where it comes from |

The status line shows `🧪 prototype mode` while it's on.

## How it works

- **Background jobs:** `worktree.bgIsolation: "none"` is Claude Code's own setting. It turns off the guard that blocks Edit/Write in the main checkout until `EnterWorktree` is called. The `CLAUDE_BG_ISOLATION` env var outranks it. This part works even without the plugin.
- **Model instructions:** while it's on, every request gets a "Prototype mode" system-prompt section. It overrides the background-session instruction to isolate, and says to commit on the current branch but ask before pushing.
- **Tools:** `EnterWorktree` is refused, and `isolation: "worktree"` is stripped from subagent (`Agent`) calls.

## Develop

```sh
claude --plugin-dir .        # load this checkout for one session
claude plugin validate .
claude plugin test .
```

Requires a Claude Code build with function-hook plugins (2.1.289 or newer).
