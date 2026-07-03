'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processarPr } = require('../../service/processar-pr');
const { validateRegistro } = require('../../core/validate');

function makePr(overrides = {}) {
  return {
    number: 42,
    title: 'Implementa X (PROJ-1)',
    body: 'descrição',
    merged_at: '2026-07-02T10:00:00Z',
    head: { ref: 'feature/x', repo: { fork: false } },
    user: { login: 'dev' },
    labels: [],
    ...overrides
  };
}

function makeGithubClient() {
  return {
    listPullRequestFiles: async () => [{ filename: 'a.ts', patch: '+linha' }],
    listPullRequestCommits: async () => [{ commit: { message: 'feat: x' } }]
  };
}

test('processa com sucesso e marca origem evento por padrão', async () => {
  const registroBase = require('../../registros/2026/exemplo-repo/PR-101.json');
  const { registro, modo } = await processarPr({
    pr: makePr(),
    repoFull: 'org/exemplo-repo',
    githubClient: makeGithubClient(),
    anthropicApiKey: 'fake-key',
    categorizarImpl: async () => ({ registro: JSON.parse(JSON.stringify(registroBase)), tentativas: 1 })
  });
  assert.equal(modo, 'completo');
  assert.equal(registro.pr_id, 'PR-42');
  assert.equal(registro.origem, 'evento');
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
});

test('marca origem backfill quando solicitado', async () => {
  const registroBase = require('../../registros/2026/exemplo-repo/PR-101.json');
  const { registro } = await processarPr({
    pr: makePr(),
    repoFull: 'org/exemplo-repo',
    githubClient: makeGithubClient(),
    anthropicApiKey: 'fake-key',
    categorizarImpl: async () => ({ registro: JSON.parse(JSON.stringify(registroBase)), tentativas: 1 }),
    origem: 'backfill'
  });
  assert.equal(registro.origem, 'backfill');
});

test('cai em modo degradado sem API key, preservando origem', async () => {
  const { registro, modo, motivoDegradado } = await processarPr({
    pr: makePr(),
    repoFull: 'org/exemplo-repo',
    githubClient: makeGithubClient(),
    anthropicApiKey: undefined,
    origem: 'backfill'
  });
  assert.equal(modo, 'degradado');
  assert.equal(registro.origem, 'backfill');
  assert.match(motivoDegradado, /ANTHROPIC_API_KEY ausente/);
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
});
