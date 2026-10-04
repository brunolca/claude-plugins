# worktree-terminal

A Claude Code mod that opens a terminal in the worktree you or your agents are working in.

When Claude runs agents in their own git worktrees (`Agent` with `isolation: "worktree"`, `EnterWorktree`), their changes live in `.claude/worktrees/<name>`. `/term` opens a shell right there: as a split next to Claude, a tab, or a window.

## Usage

| Command | Opens |
| --- | --- |
| `/term` | the session's current directory (the worktree, once Claude entered one) |
| `/term list` | lists every worktree of the repo, agents' marked |
| `/term <n>` / `/term main` / `/term <name>` | a worktree by its number, the main one, or part of its folder or branch name |
| `… --split` / `--tab` / `--window` | overrides the placement for this call |

While agent worktrees exist, a row above the prompt has one button per worktree.

`/term` runs at once, even mid-turn.

## Settings

In `/config`, under worktree-terminal:

| Setting | Values |
| --- | --- |
| Terminal app | `auto` (default), `tmux`, `zellij`, `kitty`, `wezterm`, `iterm`, `ghostty`, `warp`, `alacritty`, `gnome-terminal`, `konsole`, `terminal`, `system`, `custom` |
| Placement | `split` (default, right of Claude), `tab`, `window` |
| Custom command | used with `custom`: argv split on spaces, `{dir}` replaced by the path, e.g. `foot -D {dir}` |

`auto` reads the environment of the window Claude runs in; a multiplexer (tmux, Zellij) wins over the terminal hosting it.

## Terminals

| Terminal | split | tab | window | Needs |
| --- | --- | --- | --- | --- |
| tmux | ✓ | ✓ | → tab | |
| Zellij | ✓ | ✓ | → tab | |
| kitty | ✓ | ✓ | ✓ | `allow_remote_control yes`; `listen_on unix:/tmp/kitty` recommended; `splits` layout for a right split |
| WezTerm | ✓ | ✓ | ✓ | `wezterm` on `PATH` |
| iTerm2 | ✓ | ✓ | ✓ | Automation permission for iTerm2 (asked once) |
| Warp | → tab | ✓ | ✓ | |
| GNOME Terminal | → tab | ✓ | ✓ | |
| Konsole | → tab | ✓ | ✓ | |
| Ghostty | → window | → window | ✓ | |
| Alacritty | → window | → window | ✓ | |
| Terminal.app | → window | → window | ✓ | |
| anything else | → window | → window | ✓ | `open -a Terminal` (macOS), `x-terminal-emulator` (Linux) |

`→` is the fallback used when the terminal has no way to open that placement from outside; `/term` says when it fell back.

## Development

```sh
claude plugin validate plugins/worktree-terminal
claude plugin test plugins/worktree-terminal
claude --plugin-dir plugins/worktree-terminal   # load from the working copy, hot-reloaded
```

Adding a terminal: one entry in `TERMINALS` (`hooks/terminals.ts`) and one in `CASES` (`tests/terminals.test.ts`); a test fails while they disagree.
