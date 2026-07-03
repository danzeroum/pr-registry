'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegistro } = require('../../core/validate');
const { buildRegistroDegradado, buildTriageIssueBody, buildTriageIssueTitle } = require('../../core/degraded');

test('registro degradado é válido contra o schema', () => {
  const registro = buildRegistroDegradado({
    prId: 'PR-500',
    repo: 'exemplo-repo',
    tituloPr: 'Feature qualquer',
    autorDev: 'alguem',
    dataMerge: '2026-07-02T10:00:00Z',
    requisito: { id: 'nao-vinculado', fonte: 'nao_vinculado', titulo: '' },
    geradoPorIa: false,
    motivo: 'ANTHROPIC_API_KEY ausente'
  });

  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
  assert.equal(registro.modo, 'degradado');
  assert.ok(registro.pendencias.some((p) => p.includes('Modo degradado')));
});

test('registro degradado sempre tem acoes vazio e schema_version 1.2', () => {
  const registro = buildRegistroDegradado({
    prId: 'PR-501',
    repo: 'exemplo-repo',
    tituloPr: 'Feature X',
    autorDev: 'alguem',
    dataMerge: '2026-07-02T10:00:00Z',
    requisito: { id: 'nao-vinculado', fonte: 'nao_vinculado', titulo: '' },
    motivo: 'falha de validação de schema após retries'
  });
  assert.deepEqual(registro.acoes, []);
  assert.equal(registro.schema_version, '1.2');
});

test('aceita origem opcional (usado pelo poller do serviço)', () => {
  const registro = buildRegistroDegradado({
    prId: 'PR-502',
    repo: 'exemplo-repo',
    tituloPr: 'Feature Y',
    autorDev: 'alguem',
    dataMerge: '2026-07-02T10:00:00Z',
    requisito: { id: 'nao-vinculado', fonte: 'nao_vinculado', titulo: '' },
    motivo: 'ANTHROPIC_API_KEY ausente',
    origem: 'backfill'
  });
  assert.equal(registro.origem, 'backfill');
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
});

test('issue de triagem inclui pr_id, repo e motivo', () => {
  const title = buildTriageIssueTitle({ prId: 'PR-500', repo: 'exemplo-repo' });
  const body = buildTriageIssueBody({
    prId: 'PR-500',
    repo: 'exemplo-repo',
    motivo: 'ANTHROPIC_API_KEY ausente',
    diffBrutoScrubado: 'diff --git a/x.ts b/x.ts\n+algo'
  });
  assert.match(title, /exemplo-repo\/PR-500/);
  assert.match(body, /ANTHROPIC_API_KEY ausente/);
  assert.match(body, /diff --git a\/x\.ts/);
});

test('issue de triagem trunca diffs muito longos', () => {
  const diffGrande = 'x'.repeat(5000);
  const body = buildTriageIssueBody({ prId: 'PR-500', repo: 'exemplo-repo', motivo: 'x', diffBrutoScrubado: diffGrande });
  assert.match(body, /truncado/);
});
