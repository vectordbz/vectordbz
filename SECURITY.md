# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in VectorDBZ, please report it privately using [GitHub's private security advisory feature](https://github.com/vectordbz/vectordbz/security/advisories/new).

Alternatively, you can describe the issue in a private message to the maintainers via GitHub.

### What to Include

To help us triage and fix the issue quickly, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- VectorDBZ version affected
- Any proof-of-concept code or screenshots (if applicable)

### Response Timeline

- **Acknowledgement**: within 48 hours of receiving the report
- **Status update**: within 7 days
- **Fix release**: as soon as possible depending on severity and complexity

We will keep you informed throughout the process and credit you in the security advisory (unless you prefer to remain anonymous).

## Scope

VectorDBZ is a desktop application. Security considerations include:

- **Connection credentials** stored locally via `electron-store` (OS-level encrypted storage on supported platforms)
- **Custom JavaScript embedding functions** executed in a sandboxed Node.js `vm` context
- **Network connections** made from the desktop app to database endpoints specified by the user

Out of scope: vulnerabilities in the databases VectorDBZ connects to (report those to the respective database projects).

## Supported Versions

Security fixes are applied to the latest release. We recommend always using the most recent version.
