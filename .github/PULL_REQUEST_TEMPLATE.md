## Summary

<!-- Briefly describe what this PR does and why. Link any related issues: Closes #123 -->

## Type of Change

- [ ] Bug fix
- [ ] New feature / enhancement
- [ ] New database integration
- [ ] Documentation update
- [ ] Refactor / cleanup
- [ ] Other:

## Testing

- [ ] I ran `npm test` and all tests pass
- [ ] I ran `npm run lint` and there are no lint errors
- [ ] I tested the change manually in the app

## New Database Integration Checklist

<!-- Only fill this out if you're adding a new database. Delete otherwise. -->

- [ ] Added `'newdb'` to `DatabaseType` union in `app/src/types/index.ts`
- [ ] Added any new connection fields to `ConnectionConfig`
- [ ] Created `app/src/services/clients/newdb.ts` implementing `VectorDBClient`
- [ ] Registered the client in `app/src/services/index.ts` (export + factory case)
- [ ] Added `DatabaseOption` entry in `app/src/services/databases.ts`
- [ ] Installed the SDK in `app/package.json`
- [ ] Added mock seed script `mocks/seeds/newdb.js`
- [ ] Added Docker service in `docker-compose.yml`
- [ ] Added integration tests `app/src/services/__tests__/newdb.test.ts`
- [ ] Updated `README.md` supported databases table
- [ ] Updated `CHANGELOG.md`

## Screenshots / Demo

<!-- If relevant, add screenshots or a short GIF showing the change in action. -->
