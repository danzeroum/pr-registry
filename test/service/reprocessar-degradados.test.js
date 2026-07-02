'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../service/db');
const { pollarProjeto } = require('../../service/poller');
const { reprocessarDegradados } = require('../../service/reprocessar-degradados');
const { validateRegistro } = require('../../core/validate');

const REGISTRO_VALIDO = require('../../registros/2026/exemplo-repo/PR-101.json');

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

function githubClientBase(paginaInicial) {
  return {
    listPullRequestFiles: async () => [{ filename: 'a.ts', patch: '+x' }],
    listPullRequestCommits: async () => [{ commit: { message: 'feat: x' } }],
    listClosedPullRequestsPage: async (org, repo, { page }) => (page === 1 ? paginaInicial : []),
    getPullRequest: async (org, repo, numero) => pr(numero, '2026-07-02T10:00:00Z')
  };
}

async function gerarRegistroDegradado(conn) {
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  const projeto = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  const githubClient = githubClientBase([pr(1, '2026-07-02T10:00:00Z')]);

  await pollarProjeto({ conn, projeto, githubClient, anthropicApiKey: undefined });
  return { projetoId, githubClient };
}

test('reprocessa um registro degradado com sucesso e atualiza para modo completo', async () => {
  const conn = db.abrirBanco();
  const { githubClient } = await gerarRegistroDegradado(conn);

  const [antes] = db.listarRegistros(conn);
  assert.equal(antes.modo, 'degradado');

  const categorizarImpl = async () => ({ registro: JSON.parse(JSON.stringify(REGISTRO_VALIDO)), tentativas: 1 });
  const resultado = await reprocessarDegradados({ conn, githubClient, anthropicApiKey: 'fake-key', categorizarImpl });

  assert.equal(resultado.reprocessados, 1);
  assert.equal(resultado.aindaDegradados, 0);

  const registros = db.listarRegistros(conn);
  assert.equal(registros.length, 1, 'não deve criar um segundo registro — atualiza o mesmo (repo, pr_id)');
  assert.equal(registros[0].modo, 'completo');
  assert.equal(registros[0].pr_id, antes.pr_id);

  const { valid, errors } = validateRegistro(registros[0].json);
  assert.equal(valid, true, errors.join('\n'));
});

test('se a recategorização falhar de novo, o registro continua degradado (sem regressão)', async () => {
  const conn = db.abrirBanco();
  const { githubClient } = await gerarRegistroDegradado(conn);

  const categorizarImpl = async () => {
    throw new Error('Categorização falhou após retries de validação de schema');
  };
  const resultado = await reprocessarDegradados({ conn, githubClient, anthropicApiKey: 'fake-key', categorizarImpl });

  assert.equal(resultado.reprocessados, 0);
  assert.equal(resultado.aindaDegradados, 1);
  const [registro] = db.listarRegistros(conn);
  assert.equal(registro.modo, 'degradado');
});

test('exige ANTHROPIC_API_KEY — não tem sentido reprocessar sem ela', async () => {
  const conn = db.abrirBanco();
  await assert.rejects(
    () => reprocessarDegradados({ conn, githubClient: {}, anthropicApiKey: undefined }),
    /ANTHROPIC_API_KEY é obrigatória/
  );
});

test('sem registros degradados, não faz nada', async () => {
  const conn = db.abrirBanco();
  db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  const resultado = await reprocessarDegradados({
    conn,
    githubClient: {},
    anthropicApiKey: 'fake-key',
    categorizarImpl: async () => ({ registro: {}, tentativas: 1 })
  });
  assert.equal(resultado.reprocessados, 0);
  assert.equal(resultado.aindaDegradados, 0);
});
