# Troubleshooting

## Plugin or tools do not appear

Restart Antigravity and inspect its customization/hooks controls. Confirm the installation directory contains `plugin.json`, `hooks.json`, `mcp_config.json`, and the scripts. Run the installer from a separate source directory; keep backups outside `plugins/`. The generated MCP server name must remain `m` because longer prefixed tool names can exceed Antigravity's limit.

Run `node scripts/doctor.mjs` from the installed plugin directory. If Node moved, rerun the installer to refresh its absolute executable path.

## Health works but reads fail

Health may be unauthenticated. Check the Gateway key, service ID and required team/agent/user IDs. `TAM_API_KEY=local` is only a placeholder for auth-disabled local development. Environment variables take precedence over `config.env`. Confirm the server exposes REST v3, and that the selected namespace exists and is authorized.

## No recall in a new conversation

Check that Stop wrote the earlier turn and that both sessions use the same memory namespace. L1–L3 processing is asynchronous; this adapter also searches L0. Search queries must match stored content. Empty search results do not imply a backend error. Scenario injection contains navigation only; read a scenario explicitly through MCP.

## No capture

Stop must report an idle, successful termination (`model_stop` or `NO_TOOL_CALL`). Native transcript records must use `USER_INPUT` / `PLANNER_RESPONSE`, `status=DONE`, and a content string. Incomplete and error Stops are intentionally skipped. Check Core connectivity and `events.jsonl` in the state directory; do not post private transcript files or `config.env` in issues.

## Partial results or timeouts

Hooks fail open. Check connectivity, timeouts and Core health. Raising request timeouts also requires reviewing `hooks.json` execution limits. Capture saves up to 20 outstanding turns per Stop; an unfinished backlog needs later Stops. A server-side commit followed by a timeout can be retried and duplicated. Avoid concurrent captures sharing a state directory.

## HTTP transport refused

Use HTTPS for a remote Core. Non-loopback HTTP requires the explicit `TAM_ALLOW_INSECURE_HTTP=1` opt-in and a trusted protected network. Do not embed credentials in the base URL. Redirects are refused, so configure the final Core URL.

## Report a bug

Include plugin, Node, Antigravity and Core versions, sanitized error messages, and a minimal **synthetic** transcript if needed. For security reports, follow [SECURITY.md](../SECURITY.md).
