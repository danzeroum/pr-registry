'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commitWithRetry } = require('../../action/src/commit');

function calls(list) {
  return list.map((c) => c.args.join(' '));
}

test('push bem-sucedido na primeira tentativa não faz fetch/rebase', async () => {
  const log = [];
  const exec = async (cmd, args) => {
    log.push({ cmd, args });
    if (args[0] === 'push') return { code: 0, stdout: '', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  const sleep = async () => {};

  const result = await commitWithRetry({
    cwd: '/repo',
    branch: 'main',
    filesToStage: ['registros/2026/x/PR-1.json'],
    commitMessage: 'registro PR-1',
    exec,
    sleep
  });

  assert.equal(result.attempts, 1);
  assert.ok(!calls(log).some((c) => c.startsWith('fetch')));
  assert.ok(!calls(log).some((c) => c.startsWith('rebase')));
});

test('corrida de commits: dois jobs concorrentes — primeiro push rejeitado, fetch+rebase+retry resolve', async () => {
  const log = [];
  let pushAttempt = 0;
  const exec = async (cmd, args) => {
    log.push({ cmd, args });
    if (args[0] === 'push') {
      pushAttempt += 1;
      if (pushAttempt === 1) {
        return { code: 1, stdout: '', stderr: '! [rejected] main -> main (non-fast-forward)' };
      }
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const sleeps = [];
  const sleep = async (ms) => {
    sleeps.push(ms);
  };

  const result = await commitWithRetry({
    cwd: '/repo',
    branch: 'main',
    filesToStage: ['registros/2026/repo-a/PR-1.json', 'registros/2026/repo-a/PR-1.md'],
    commitMessage: 'registro PR-1',
    exec,
    sleep,
    baseDelayMs: 100,
    maxDelayMs: 1000
  });

  assert.equal(result.attempts, 2);
  assert.equal(pushAttempt, 2);
  assert.ok(calls(log).some((c) => c.startsWith('fetch origin main')));
  assert.ok(calls(log).some((c) => c.startsWith('rebase origin/main')));
  assert.deepEqual(sleeps, [100]);
});

test('backoff exponencial entre tentativas sucessivas', async () => {
  let pushAttempt = 0;
  const exec = async (cmd, args) => {
    if (args[0] === 'push') {
      pushAttempt += 1;
      if (pushAttempt < 3) return { code: 1, stdout: '', stderr: 'rejected' };
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const sleeps = [];
  const sleep = async (ms) => sleeps.push(ms);

  const result = await commitWithRetry({
    cwd: '/repo',
    branch: 'main',
    filesToStage: ['a.json'],
    commitMessage: 'msg',
    exec,
    sleep,
    baseDelayMs: 100,
    maxDelayMs: 1000
  });

  assert.equal(result.attempts, 3);
  assert.deepEqual(sleeps, [100, 200]);
});

test('desiste após maxAttempts e lança erro descritivo', async () => {
  const exec = async (cmd, args) => {
    if (args[0] === 'push') return { code: 1, stdout: '', stderr: 'always rejected' };
    return { code: 0, stdout: '', stderr: '' };
  };
  const sleep = async () => {};

  await assert.rejects(
    () =>
      commitWithRetry({
        cwd: '/repo',
        branch: 'main',
        filesToStage: ['a.json'],
        commitMessage: 'msg',
        exec,
        sleep,
        maxAttempts: 3,
        baseDelayMs: 1
      }),
    /push falhou após 3 tentativas/
  );
});

test('rebase com conflito real lança erro em vez de tentar indefinidamente', async () => {
  const exec = async (cmd, args) => {
    if (args[0] === 'push') return { code: 1, stdout: '', stderr: 'rejected' };
    if (args[0] === 'rebase') return { code: 1, stdout: '', stderr: 'CONFLICT (content): Merge conflict' };
    return { code: 0, stdout: '', stderr: '' };
  };
  const sleep = async () => {};

  await assert.rejects(
    () =>
      commitWithRetry({
        cwd: '/repo',
        branch: 'main',
        filesToStage: ['a.json'],
        commitMessage: 'msg',
        exec,
        sleep,
        maxAttempts: 3,
        baseDelayMs: 1
      }),
    /rebase falhou/
  );
});

test('não permite commitar sem arquivos', async () => {
  await assert.rejects(
    () => commitWithRetry({ cwd: '/repo', branch: 'main', filesToStage: [], commitMessage: 'msg' }),
    /nenhum arquivo para commitar/
  );
});
