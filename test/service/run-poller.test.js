'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../service/db');
const { cicloCompleto } = require('../../service/run-poller');

function pr(number, mergedAt) {
  return {
    number,
    title: `PR ${number}`,
    body: '',
    merged_at: mergedAt,
    updated_at: mergedAt,
    head: { ref: `feature/${number}`, repo: { fork: false } },
    user: { login: 'dev' },
    labels: []
  };
}

test('cicloCompleto processa todos os projetos cadastrados, um a um', async () => {
  const conn = db.abrirBanco();
  db.cadastrarProjeto(conn, { org: 'org', repo: 'repo-a' });
  db.cadastrarProjeto(conn, { org: 'org', repo: 'repo-b' });

  const chamadasPorRepo = {};
  const githubClient = {
    listPullRequestFiles: async () => [{ filename: 'a.ts', patch: '+x' }],
    listPullRequestCommits: async () => [{ commit: { message: 'x' } }],
    listClosedPullRequestsPage: async (org, repo, { page }) => {
      chamadasPorRepo[repo] = (chamadasPorRepo[repo] || 0) + 1;
      return page === 1 ? [pr(1, '2026-07-02T10:00:00Z')] : [];
    }
  };

  await cicloCompleto(conn, githubClient, undefined);

  assert.ok(chamadasPorRepo['repo-a'] >= 1);
  assert.ok(chamadasPorRepo['repo-b'] >= 1);
  assert.equal(db.listarRegistros(conn).length, 2);
});

test('cicloCompleto continua para o próximo projeto mesmo se um falhar', async () => {
  const conn = db.abrirBanco();
  db.cadastrarProjeto(conn, { org: 'org', repo: 'quebrado' });
  db.cadastrarProjeto(conn, { org: 'org', repo: 'saudavel' });

  const githubClient = {
    listPullRequestFiles: async () => [],
    listPullRequestCommits: async () => [],
    listClosedPullRequestsPage: async (org, repo) => {
      if (repo === 'quebrado') throw new Error('falha de rede simulada');
      return [];
    }
  };

  await assert.doesNotReject(() => cicloCompleto(conn, githubClient, undefined));
});
