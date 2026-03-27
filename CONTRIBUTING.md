# Contributing to VectorDBZ

Thank you for your interest in contributing! Contributions of all kinds are welcome — new database integrations, bug fixes, feature improvements, and documentation.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Adding a New Database Integration](#adding-a-new-database-integration)
- [Running Tests](#running-tests)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Analytics Transparency](#analytics-transparency)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior privately — see the enforcement section in `CODE_OF_CONDUCT.md`.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/vectordbz.git
   cd vectordbz
   ```
3. **Create a branch** for your change:
   ```bash
   git checkout -b feat/my-feature
   ```
4. Set up your local environment — see **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for the full guide
5. Make your changes, then [open a pull request](#submitting-a-pull-request)

---

## Adding a New Database Integration

This is the most impactful type of contribution and follows a clear, well-defined pattern. Every database is a TypeScript class implementing the `VectorDBClient` interface.

**Read the full guide:** [docs/ADDING_A_DATABASE.md](docs/ADDING_A_DATABASE.md)

The files you need to touch:

| File | Change |
|------|--------|
| `app/src/types/index.ts` | Add `'newdb'` to `DatabaseType`, add any new connection fields |
| `app/src/services/clients/newdb.ts` | Create the client class implementing `VectorDBClient` |
| `app/src/services/index.ts` | Export the class and add a `case` to `createClient()` |
| `app/src/services/databases.ts` | Add a `DatabaseOption` entry (color, connection fields, defaults) |
| `app/package.json` | Add the database SDK as a dependency |
| `mocks/seeds/newdb.js` | Add a seed script for sample data |
| `docker-compose.yml` | Add the database service for local testing |
| `app/src/services/__tests__/newdb.test.ts` | Add integration tests |

Before starting, [open an issue](https://github.com/vectordbz/vectordbz/issues/new?template=new_db_integration.yml) to discuss the integration and avoid duplicate work.

---

## Running Tests

Tests connect to real running database instances. Start the relevant containers first:

```bash
docker-compose up -d
cd app
npm test
```

For lint and type checking:

```bash
npm run lint
npx tsc --noEmit
```

---

## Submitting a Pull Request

1. Ensure tests pass and lint is clean
2. Write a clear PR title and description
3. Reference related issues with `Closes #123`
4. Fill out the PR template checklist

For large changes — new features, new DB integrations, architectural changes — please open an issue first to discuss the approach.

---

## Reporting Bugs

Use the [bug report issue template](https://github.com/vectordbz/vectordbz/issues/new?template=bug_report.yml).

For security vulnerabilities, see [SECURITY.md](SECURITY.md) — **do not open a public issue**.

---

## Analytics Transparency

VectorDBZ has optional anonymous usage analytics (PostHog), active only when `VITE_PUBLIC_POSTHOG_KEY` is set at build time. Official releases include analytics. **Self-built binaries and contributor builds ship without analytics by default.**
