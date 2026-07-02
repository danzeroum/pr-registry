'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveGithubToken } = require('../../service/github-token');

test('sem nenhuma credencial, modo não-autenticado (público, 60 req/h)', () => {
  const r = resolveGithubToken({});
  assert.equal(r.token, undefined);
  assert.equal(r.modo, 'nao-autenticado');
});

test('usa PAT quando disponível', () => {
  const r = resolveGithubToken({ PR_REGISTRY_PAT: 'ghp_fake' });
  assert.equal(r.token, 'ghp_fake');
  assert.equal(r.modo, 'pat');
});

test('prioriza token de GitHub App sobre PAT quando ambos presentes', () => {
  const r = resolveGithubToken({ PR_REGISTRY_APP_TOKEN: 'app-token', PR_REGISTRY_PAT: 'ghp_fake' });
  assert.equal(r.token, 'app-token');
  assert.equal(r.modo, 'github-app');
});
