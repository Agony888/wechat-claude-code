# Upstream analysis and Codex migration

## Source snapshot

- Upstream: https://github.com/Wechat-ggGitHub/wechat-claude-code
- Inspected default branch: `main`
- Inspected commit: `50143077c012352115398d446c12a0e3a9af6d12`
- License: MIT; the upstream license is retained in the skill root.

## Architecture retained

1. `src/wechat/`: iLink account login, encrypted message polling, media download/upload, sending, and rate limiting.
2. `src/main.ts`: message routing, typing state, pending queue, abort handling, session persistence, and automatic delivery of generated files.
3. `src/commands/`: WeChat slash commands for thread, workspace, model, prompt, history, files, and skills.
4. `src/session.ts` and `src/store.ts`: per-account state and local chat transcript.
5. `scripts/daemon.mjs`: detached background process management on Windows, macOS, and Linux.

## Claude-to-Codex mapping

| Upstream behavior | Codex adaptation |
|---|---|
| `claude -p - --output-format stream-json` | `codex exec --json -` |
| `--resume <session_id>` | `codex exec resume <thread_id> -` |
| Claude `system/init` session ID | Codex `thread.started.thread_id` |
| `text_delta` and `message_delta.stop_reason` | `item.completed(agent_message)` and `turn.completed` |
| `--append-system-prompt` | Guidance prepended to the user prompt in a marked block |
| Image paths appended to Markdown | Codex `--image <path>` |
| `~/.claude/skills` and Claude plugin cache | `$CODEX_HOME/skills` and Codex plugin cache |
| Claude SDK session fields | Codex thread ID fields |

Codex JSONL does not expose Claude's token-level `text_delta`/`stop_reason` pair. The parser therefore buffers one completed agent message: when a later agent message arrives, the previous message is emitted as progress; `turn.completed` marks the final buffered message as the final answer.

## Security and compatibility boundary

- The WeChat transport comes from the upstream project's iLink implementation, not an official OpenAI integration. Credentials remain local under `~/.wechat-codex` and must never be printed.
- The bridge is unattended, so it uses non-interactive approvals with a `workspace-write` sandbox. It does not use Codex's dangerous full-access bypass.
- The bundled npm dependency `@openai/codex` avoids the WindowsApps executable ACL problem seen with the Codex Desktop packaged binary.
- Codex authentication is reused from the local CLI (`~/.codex/auth.json`) or a process-scoped `CODEX_API_KEY`.
