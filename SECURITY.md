# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub's private vulnerability reporting:
**[Security → Report a vulnerability](https://github.com/HBarefoot/mcp-testmate/security/advisories/new)** on this repository.

Do not open public issues for security reports. You'll get an acknowledgment within a few days; fixes are released as patch versions and credited unless you prefer otherwise.

## Scope notes

mcp-testmate connects to the MCP server *you* configure and executes the stdio command *you* provide in `mcp-testmate.config.json` — treat that config like any other executable project configuration (e.g. npm scripts) when reviewing third-party PRs. The CLI makes no network calls other than to the configured target; the badge is a static shields.io URL.

## Supported versions

Only the latest published minor receives fixes (pre-1.0).
