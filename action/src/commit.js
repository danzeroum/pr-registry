'use strict';

const { execFile } = require('child_process');

function defaultExec(cmd, args, options = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: options.cwd }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Commita e envia arquivos para o repositório central com tolerância a
 * corrida entre jobs concorrentes (múltiplos merges em múltiplos repos
 * terminando ao mesmo tempo, RNF3: >= 20 repos, >= 50 PRs/dia). Faz o
 * add+commit uma única vez e, se o push for rejeitado por non-fast-forward,
 * repete fetch+rebase+push com backoff exponencial.
 *
 * `exec` e `sleep` são injetáveis para testes — nenhuma chamada real a git
 * acontece nos testes unitários.
 */
async function commitWithRetry({
  cwd,
  branch,
  filesToStage,
  commitMessage,
  exec = defaultExec,
  sleep = defaultSleep,
  maxAttempts = 5,
  baseDelayMs = 1000,
  maxDelayMs = 16000
}) {
  if (filesToStage.length === 0) {
    throw new Error('commitWithRetry: nenhum arquivo para commitar.');
  }

  await exec('git', ['add', ...filesToStage], { cwd });
  const commit = await exec('git', ['commit', '-m', commitMessage], { cwd });
  if (commit.code !== 0 && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
    throw new Error(`commitWithRetry: git commit falhou: ${commit.stderr || commit.stdout}`);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const push = await exec('git', ['push', 'origin', `HEAD:${branch}`], { cwd });
    if (push.code === 0) {
      return { attempts: attempt };
    }
    lastError = push.stderr || push.stdout;

    if (attempt === maxAttempts) break;

    await exec('git', ['fetch', 'origin', branch], { cwd });
    const rebase = await exec('git', ['rebase', `origin/${branch}`], { cwd });
    if (rebase.code !== 0) {
      throw new Error(
        `commitWithRetry: rebase falhou na tentativa ${attempt} (provável conflito real, não apenas corrida): ${
          rebase.stderr || rebase.stdout
        }`
      );
    }

    const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
    await sleep(delay);
  }

  throw new Error(`commitWithRetry: push falhou após ${maxAttempts} tentativas: ${lastError}`);
}

module.exports = { commitWithRetry, defaultExec, defaultSleep };
