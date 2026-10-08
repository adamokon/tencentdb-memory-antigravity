# Security policy

This adapter is experimental. Security fixes target the latest published version; there is no support SLA.

Report vulnerabilities privately through the repository's GitHub **Security → Report a vulnerability** facility. Do not include credentials, private conversations, production endpoints or sensitive data in public issues. If private reporting is unavailable, open a public issue requesting a private reporting channel without disclosing exploit details.

Capture sends full user/assistant turns to the configured Memory Core. The adapter relies on Core authentication, authorization, retention and the underlying transport. Namespace identifiers and an auth-disabled server's placeholder Bearer header are not security controls. Prefer authenticated HTTPS deployments and restrict access to Core.

Retrieved content is untrusted and may contain prompt injection. The context wrapper cannot guarantee model compliance. Use synthetic records when testing and do not grant access to a Core whose operators or data you do not trust.

Checkpoint deduplication is not exactly-once delivery. Core timeouts and simultaneous captures can duplicate records. Local operational logs contain conversation identifiers. Review README.md for the full data handling and concurrency limitations.
