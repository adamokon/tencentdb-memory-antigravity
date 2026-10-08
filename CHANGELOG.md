# Changelog

## 0.1.2 — 2026-10-08

Initial public experimental release.

- Preserve acknowledged capture hashes beyond 500 turns to prevent sequential replay.
- Process the oldest pending batch rather than silently skipping earlier backlog.
- Validate MCP tool arguments and JSON-RPC request envelopes; negotiate supported protocol versions.
- Refuse HTTP redirects and credentials embedded in Core URLs.
- Harden installer permissions and cleanup of temporary configuration copies.
- Add public documentation, contribution/security guidance, and macOS/Linux CI.

## 0.1.1 — 2026-09-21

Private prototype validation: native Antigravity transcript records, L0 fallback, direct Core connection, shortened MCP server name, absolute Node paths, and synthetic CLI capture/recall.

## 0.1.0 — 2026-08-29

Initial hooks + MCP prototype.
