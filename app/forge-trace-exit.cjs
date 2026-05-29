// Diagnostic preload (wired via NODE_OPTIONS=--require) to find why
// `electron-forge make` ends silently with exit 0 during packaging.
// Forge's listr renderer swallows the underlying error; this traces the
// real cause: an explicit process.exit, a drained event loop (dropped
// promise), or a swallowed exception/rejection.
const w = (m) => {
  try {
    process.stderr.write(`[trace-exit] ${m}\n`);
  } catch {}
};

w(`installed in pid ${process.pid} (${process.argv.slice(1).join(' ')})`);

const origExit = process.exit.bind(process);
process.exit = (code) => {
  w(`process.exit(${code}) called from:\n${new Error('exit-stack').stack}`);
  return origExit(code);
};

process.on('beforeExit', (code) => {
  w(`'beforeExit' code=${code} — event loop is empty (no pending async work)`);
});
process.on('exit', (code) => {
  w(`'exit' code=${code}`);
});
process.on('uncaughtException', (err) => {
  w(`uncaughtException: ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (reason) => {
  w(
    `unhandledRejection: ${reason && reason.stack ? reason.stack : JSON.stringify(reason)}`,
  );
});
