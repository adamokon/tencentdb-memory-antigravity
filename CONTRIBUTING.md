# Contributing

This is a small, dependency-free ES module project. Use Node.js 20 or later and run `npm test` and `bash -n install.sh` before proposing a change. Test with local mock servers and synthetic records; CI must not require model accounts or a live Memory Core.

Open an issue or pull request with the concrete problem, expected behavior, a minimal reproduction and relevant test results. Keep direct Core integration separate from Antigravity's provider traffic. Preserve fail-open hook behavior, tenant fields and existing MCP tool names.

Do not commit `config.env`, generated installation configuration, state/checkpoints, real transcripts, keys or private deployment information. Follow SECURITY.md for vulnerabilities.

Contributions are made under the repository's MIT license. Maintainers review changes; there is no guaranteed response time or commercial support commitment.
