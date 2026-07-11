---
name: wechat-codex
description: Manage and operate a local personal-WeChat bridge for Codex CLI, including installation, QR-code account binding, starting or stopping the background bridge, checking status and logs, changing the working directory or model, and diagnosing Codex/WeChat connectivity. Use when the user mentions 微信连接 Codex、微信桥接、微信远程 Codex、启动或停止微信服务、微信扫码绑定、wechat codex bridge、微信日志, or asks to use Codex skills from WeChat.
---

# WeChat Codex Bridge

Resolve this skill's directory from the loaded `SKILL.md`; do not assume the current working directory. The installed project source, package manifest, scripts, and build output live in that directory.

## Operating workflow

1. Run `node scripts/doctor.mjs` from the skill directory.
2. If dependencies or build output are missing, run `npm install`. This installs the bundled official Codex CLI and compiles TypeScript.
3. If no WeChat account is bound, explain that setup opens a QR code and run `npm run setup` when the user requested setup or connection.
4. Check the service with `npm run daemon -- status`.
5. Execute an explicitly requested action directly. Otherwise report the state and the relevant next command.
6. After setup, start, stop, or restart, rerun `node scripts/doctor.mjs` or `npm run daemon -- status` to verify the result.

Do not read or display account JSON, `~/.codex/auth.json`, tokens, AES keys, or cookies. It is sufficient to check whether the files exist.

## Commands

Run all commands from the skill directory.

| Action | Command |
|---|---|
| Diagnose | `node scripts/doctor.mjs` |
| Install/update dependencies and build | `npm install` |
| Bind WeChat with a QR code | `npm run setup` |
| Start bridge | `npm run daemon -- start` |
| Stop bridge | `npm run daemon -- stop` |
| Restart bridge | `npm run daemon -- restart` |
| Check status | `npm run daemon -- status` |
| Show recent logs | `npm run daemon -- logs` |
| Compile | `npm run build` |
| Run tests | `npm test` |

On Windows, invoke `npm.cmd` instead of `npm` only when PowerShell execution policy blocks `npm.ps1`.

## WeChat-side commands

- `/help`: show bridge commands.
- `/clear`: clear the active Codex thread and local transcript.
- `/stop`: cancel the active turn and queued messages.
- `/status`: show working directory, model, thread ID, and state.
- `/model <model>`: override the Codex model for later turns.
- `/prompt <text>`: prepend persistent guidance to later prompts; `/prompt clear` removes it.
- `/cwd <path>`: change the Codex workspace.
- `/skills [full]`: list Codex skills from `$CODEX_HOME/skills` and installed plugins.
- `/<skill-name> <request>`: invoke an installed Codex skill.
- `/send <path>`: send a local file back to WeChat.
- `/compact`: start a fresh Codex thread while retaining the local transcript.

## Runtime behavior

The bridge invokes the bundled official CLI through `codex exec --json`, uses `thread_id` with `codex exec resume`, attaches images through `--image`, and runs with `workspace-write` plus non-interactive approvals. The workspace is the configured `/cwd` directory.

Set `WCC_CODEX_BIN` only when an alternate Codex executable is required. Set `WECHAT_CODEX_DATA_DIR` to relocate bridge data; the default is `~/.wechat-codex`.

Read [references/upstream-analysis.md](references/upstream-analysis.md) only when explaining the architecture, migration decisions, security boundary, or differences from the upstream Claude project.
