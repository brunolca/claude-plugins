# claude-plugins

Bruno Carneiro's Claude Code plugins, as one marketplace.

| Plugin | What it does |
| --- | --- |
| [prototype-mode](plugins/prototype-mode) | `/proto on` flags a project for prototype mode: no git worktrees, Claude iterates and commits directly on the current branch (main included), background jobs too. |
| [worktree-terminal](plugins/worktree-terminal) | `/term` opens a terminal split, tab or window in the session's worktree or any agent's worktree; buttons above the prompt for agent worktrees. Detects tmux, Zellij, kitty, WezTerm, iTerm2, Ghostty, Warp, Alacritty, GNOME Terminal, Konsole and Terminal.app. |

## Install

In Claude Code:

```
/plugin marketplace add brunolca/claude-plugins
/plugin install prototype-mode@brunolca
/plugin install worktree-terminal@brunolca
```

or from a shell:

```sh
claude plugin marketplace add brunolca/claude-plugins
claude plugin install prototype-mode@brunolca
claude plugin install worktree-terminal@brunolca
```

Update with `claude plugin marketplace update brunolca`, then `/reload-plugins`.

## Develop

Each plugin lives in `plugins/<name>/`. Load one from disk for a session with `claude --plugin-dir plugins/<name>`, and check it with:

```sh
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
```

CI runs both for every plugin on each push. To add a plugin, create `plugins/<name>/` and add its entry to `.claude-plugin/marketplace.json`.

## License

MIT
