# TencentDB Memory for Google Antigravity

A dependency-free community adapter that gives Google Antigravity conversation memory through **native lifecycle hooks and MCP**. Antigravity connects to its model providers using its own account; this adapter connects directly to TencentDB Agent Memory's **Memory Core**.

**Status: experimental, initial public release.** Licensed under [MIT](LICENSE). This project is independent of Google and Tencent.

## What it does

- **PreInvocation:** searches L0 conversations and L1 atomic memories, reads the L3 profile, and lists L2 scenarios. Injects relevant context as an untrusted `ephemeralMessage`.
- **Stop:** writes completed user/assistant turns to L0. Checkpoints successful writes locally so sequential invocations do not repeatedly capture the same turn.
- **MCP:** offers explicit search, profile/scenario reads, and manual turn capture.
- **Fail-open hooks:** Memory Core outages produce an empty recall or skipped capture and allow Antigravity to continue.

L0 recall makes a new turn available before asynchronous L1–L3 extraction. Scenario navigation is injected; full scenario contents can be read with MCP.

```text
Antigravity ─────────────────────────→ model providers
    │                                   normal provider authentication
    ├── PreInvocation (recall) ──┐
    ├── Stop (capture) ──────────┼────→ Memory Core REST v3 :8420
    └── MCP stdio tools ────────┘
```

Memory Proxy is not required. No npm dependencies are installed.

## Requirements

- Node.js **20 or later**.
- Antigravity with plugin support and `PreInvocation` / `Stop` hooks.
- A running TencentDB Agent Memory Core with the L0–L3 REST v3 endpoints.
- macOS or Linux for the Bash installer. Native Windows installation is not validated.

Install Memory Core using the [official upstream instructions](https://github.com/TencentCloud/TencentDB-Agent-Memory/tree/feat/server_team/MemoryCore). This project does not provision a database or configure model credentials for Core extraction.

## Install

```bash
git clone https://github.com/adamokon/tencentdb-memory-antigravity.git
cd tencentdb-memory-antigravity
./install.sh
```

This installs into `~/.gemini/config/plugins/tencentdb-memory-antigravity`. For one workspace:

```bash
./install.sh --workspace /path/to/project
```

Edit the installed `config.env` before use:

```dotenv
TAM_BASE_URL=http://127.0.0.1:8420
TAM_API_KEY=local
TAM_SERVICE_ID=example-service
TAM_TEAM_ID=example-team
TAM_AGENT_ID=antigravity
TAM_USER_ID=example-user
```

`local` is a placeholder for an **auth-disabled local development Core**, not a security credential. For remote deployments, use HTTPS and the actual Gateway API key. Optional `TAM_USER_KEY` becomes `x-tdai-user-key`. Team, agent, user and service IDs must match your intended namespace; they do not themselves prove authorization.

Restart Antigravity after installing. The plugin contains the named hook `tencentdb-memory` and MCP server `m`. The short MCP server name keeps Antigravity's prefixed tool names within its 64-character limit.

The installer preserves an existing `config.env`, gives it mode `0600`, and moves previous installations to the neighboring `plugin-backups/` directory. Generated configuration uses the absolute Node executable path. Do not run `agy plugin install` with a source path equal to the installed destination: some CLI versions copy files onto themselves. Use this installer from a separate source checkout.

## Verify

```bash
node ~/.gemini/config/plugins/tencentdb-memory-antigravity/scripts/doctor.mjs
```

A successful diagnostic verifies health and scoped v3 read access. It does not prove write access, namespace authorization, extraction quality, or that the GUI loaded the plugin.

For an end-to-end check, use **synthetic data**: tell Antigravity a unique project code in one conversation, allow it to finish, then ask for the code in a separate conversation. Confirm the value was absent from the second prompt and came from injected memory. Keep this test out of shared production namespaces.

### Validation status

A macOS test of the 0.1.1 prototype on 2026-09-21 verified automatic L0 capture and recall in two independent Antigravity CLI conversations, plus MCP readback. Version 0.1.2 adds focused regression tests and publication fixes. The public CI matrix covers Node 20/22/24 on macOS and Linux with local mock servers; it never calls a production Memory Core. Separate GUI/IDE behavior and asynchronous L1–L3 extraction have not been end-to-end validated.

## Configuration

Process environment variables override the installed `config.env`. See [config.env.example](config.env.example) for every option.

| Setting | Default | Purpose |
| --- | --- | --- |
| `TAM_RECALL_LIMIT` | `5` | Results per search, clamped to 1–20 |
| `TAM_RECALL_TIMEOUT_MS` | `3000` | Timeout per recall request |
| `TAM_WRITE_TIMEOUT_MS` | `5000` | Timeout per capture request |
| `TAM_MAX_CONTEXT_CHARS` | `12000` | Total injected context limit |
| `TAM_MAX_MEMORY_CHARS` | `2400` | Limit per recalled memory |
| `TAM_MAX_CAPTURE_CHARS` | `50000` | Limit per captured message |
| `TAM_RECALL_EVERY_INVOCATION` | `0` | Disable per-message recall deduplication when `1` |
| `TAM_ALLOW_INSECURE_HTTP` | `0` | Permit non-loopback HTTP only when explicitly set to `1` |
| `TAM_TASK_ID` | empty | Optional task scope |
| `TAM_STATE_DIR` | platform default | Checkpoints and operational metadata |

The default state directory is `~/.local/state/tencentdb-memory-antigravity/` on macOS/Linux (or under `XDG_STATE_HOME`), and `%LOCALAPPDATA%/tencentdb-memory-antigravity/` on Windows. Choose a separate state directory when switching memory namespaces or installations.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `tencentdb_memory_search` | Search L1 atomic memories |
| `tencentdb_conversation_search` | Search L0 conversation history, optionally within a session |
| `tencentdb_read_core` | Read the L3 profile |
| `tencentdb_list_scenes` | List L2 scenario paths |
| `tencentdb_read_scene` | Read a scenario by exact path |
| `tencentdb_capture_turn` | Manually save a user/assistant turn to L0 |

## Data handling and limitations

**Capture sends full user/assistant turns to your configured Core**, rather than selecting only decisions. Content can include Antigravity's user-message wrappers. It excludes native tool records, unfinished responses and the separate thinking field. Captured messages are truncated at the configured limit; follow-up L1–L3 extraction belongs to Core.

Local state holds hashes and recall checkpoints. Operational logs hold timestamps, conversation IDs, record counts and termination status; log rotation retains one previous file. They do not intentionally log conversation text or credentials. Apply your own Core access, retention and deletion policies.

Retrieved memories are explicitly marked as untrusted context. This reduces ambiguity but does not guarantee protection from prompt injection. Only use a trusted Core, and avoid sending sensitive material to a shared or unauthorized namespace. HTTP outside loopback is refused by default; credentials are not sent through redirects.

Capture processes the **oldest 20 outstanding turns** per Stop. More backlog needs subsequent successful Stops. All acknowledged turn hashes are retained, so checkpoint storage grows with a conversation. The transcript is read into memory; very large transcripts are not streamed. Only the final assistant response within a turn is captured.

Checkpoints provide sequential deduplication, not exactly-once delivery: a timeout after the server committed a write can cause a duplicate on retry. Concurrent hooks for the same conversation are not coordinated. Do not run simultaneous installations against a shared state directory. A permanently malformed checkpoint or deleting state may replay older turns. Failed writes are retried only when a later Stop occurs; there is no background retry service.

## Update and uninstall

Run the installer from an updated source checkout to update while retaining configuration. Backups remain outside the plugin discovery directory.

To disable all hooks and tools, stop active Antigravity sessions and move the plugin outside its scanned directory:

```bash
mkdir -p ~/.gemini/config/plugin-backups
mv ~/.gemini/config/plugins/tencentdb-memory-antigravity \
  ~/.gemini/config/plugin-backups/tencentdb-memory-antigravity-disabled
```

Choose an unused destination name. For workspace installs, use `.agents/plugins/` and `.agents/plugin-backups/` in that workspace. Restart Antigravity. This preserves configuration and local checkpoints. Remote memory remains in Core and must be removed with its own retention/deletion controls.

## Development

```bash
npm test
bash -n install.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), [SECURITY.md](SECURITY.md) and [troubleshooting](docs/TROUBLESHOOTING.md).

## References

- [Antigravity lifecycle hooks](https://antigravity.google/docs/hooks)
- [Antigravity plugins](https://antigravity.google/docs/plugins)
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)

Copyright © 2026 Adam Okon. Google Antigravity and TencentDB are names of their respective projects; no affiliation or endorsement is implied.
