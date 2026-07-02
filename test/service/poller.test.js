'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../service/db');
const { pollarProjeto } = require('../../service/poller');

const REGISTRO_VALIDO = require('../../registros/2026/exemplo-repo/PR-101.json');

function pr(number, mergedAt, updatedAt = mergedAt, overrides = {}) {
  return {
    number,
    title: `PR ${number}`,
    body: '',
    merged_at: mergedAt,
    updated_at: updatedAt,
    head: { ref: `feature/${number}`, repo: { fork: false } },
    user: { login: 'dev' },
    labels: [],
    ...overrides
  };
}

function categorizarSucesso() {
  return async () => ({ registro: JSON.parse(JSON.stringify(REGISTRO_VALIDO)), tentativas: 1 });
}

function githubClientDePaginas(paginas) {
  return {
    listPullRequestFiles: async () => [{ filename: 'a.ts', patch: '+x' }],
    listPullRequestCommits: async () => [{ commit: { message: 'feat: x' } }],
    listClosedPullRequestsPage: async (org, repo, { page }) => paginas[page - 1] || []
  };
}

function novoProjeto(conn, overrides = {}) {
  const id = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo', ...overrides });
  return db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
}

test('processa PRs novos e avança o cursor para o maior merged_at processado (não para "agora")', async () => {
  const conn = db.abrirBanco();
  const projeto = novoProjeto(conn);
  const githubClient = githubClientDePaginas([[pr(1, '2026-07-02T10:00:00Z'), pr(2, '2026-07-02T10:05:00Z')]]);

  const resultado = await pollarProjeto({
    conn,
    projeto,
    githubClient,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso()
  });

  assert.equal(resultado.prsProcessados, 2);
  assert.equal(resultado.novoCursorIso, '2026-07-02T10:05:00Z');
  const atualizado = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  assert.equal(atualizado.cursorIso, '2026-07-02T10:05:00Z');
  assert.equal(db.registroExiste(conn, { repo: 'exemplo-repo', prId: 'PR-1' }), true);
  assert.equal(db.registroExiste(conn, { repo: 'exemplo-repo', prId: 'PR-2' }), true);
});

test('critério: PR mergeado durante o poll não é perdido (sobreposição do cursor)', async () => {
  const conn = db.abrirBanco();
  const projeto0 = novoProjeto(conn);

  // Rodada 1: a API só devolve PR-1 (10:00) e PR-2 (10:05) — PR-3 (10:02)
  // já mergeou mas a listagem da API ainda não refletiu isso (lag).
  const clientRodada1 = githubClientDePaginas([[pr(1, '2026-07-02T10:00:00Z'), pr(2, '2026-07-02T10:05:00Z')]]);
  const r1 = await pollarProjeto({
    conn,
    projeto: projeto0,
    githubClient: clientRodada1,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso()
  });
  assert.equal(r1.novoCursorIso, '2026-07-02T10:05:00Z');

  // Sem sobreposição, a rodada 2 buscaria só a partir de 10:05 e nunca
  // veria PR-3 (10:02). Com overlap de 5min, a janela volta para 10:00,
  // reapresentando PR-1/PR-2 (idempotentes, pulados) e capturando PR-3.
  const projeto1 = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  const clientRodada2 = githubClientDePaginas([
    [
      pr(1, '2026-07-02T10:00:00Z'),
      pr(2, '2026-07-02T10:05:00Z'),
      pr(3, '2026-07-02T10:02:00Z', '2026-07-02T10:02:00Z')
    ]
  ]);
  const r2 = await pollarProjeto({
    conn,
    projeto: projeto1,
    githubClient: clientRodada2,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso(),
    overlapMinutos: 5
  });

  assert.equal(r2.prsProcessados, 1, 'só PR-3 é novo; PR-1/PR-2 são pulados por já existirem');
  assert.equal(db.registroExiste(conn, { repo: 'exemplo-repo', prId: 'PR-3' }), true);
  assert.equal(db.listarRegistros(conn, { projetoId: projeto0.id }).length, 3);
});

test('sem sobreposição (overlapMinutos: 0), o mesmo cenário perderia o PR — prova de que a proteção é necessária', async () => {
  const conn = db.abrirBanco();
  const projeto0 = novoProjeto(conn);
  const clientRodada1 = githubClientDePaginas([[pr(1, '2026-07-02T10:00:00Z'), pr(2, '2026-07-02T10:05:00Z')]]);
  await pollarProjeto({
    conn,
    projeto: projeto0,
    githubClient: clientRodada1,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso()
  });

  const projeto1 = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  // rodada 2 sem overlap: janela começa exatamente no cursor (10:05),
  // PR-3 (10:02) fica fora da janela e nunca é buscado.
  const clientRodada2 = githubClientDePaginas([
    [pr(1, '2026-07-02T10:00:00Z'), pr(2, '2026-07-02T10:05:00Z'), pr(3, '2026-07-02T10:02:00Z')]
  ]);
  await pollarProjeto({
    conn,
    projeto: projeto1,
    githubClient: clientRodada2,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso(),
    overlapMinutos: 0
  });

  assert.equal(db.registroExiste(conn, { repo: 'exemplo-repo', prId: 'PR-3' }), false);
});

test('trava em processo: dois polls concorrentes do mesmo projeto — o segundo é pulado', async () => {
  const conn = db.abrirBanco();
  const projeto = novoProjeto(conn);

  let liberar;
  const travado = new Promise((resolve) => {
    liberar = resolve;
  });

  const githubClient = {
    listPullRequestFiles: async () => [{ filename: 'a.ts', patch: '+x' }],
    listPullRequestCommits: async () => [{ commit: { message: 'x' } }],
    listClosedPullRequestsPage: async () => {
      await travado;
      return [];
    }
  };

  const p1 = pollarProjeto({ conn, projeto, githubClient, anthropicApiKey: 'fake-key' });
  const p2 = pollarProjeto({ conn, projeto, githubClient, anthropicApiKey: 'fake-key' });

  liberar();
  const [r1, r2] = await Promise.all([p1, p2]);

  const skippedCount = [r1, r2].filter((r) => r.skipped === 'poll-ja-em-andamento').length;
  assert.equal(skippedCount, 1);
});

test('duracao_ms é registrado em execucoes_poller usando o clock injetado', async () => {
  const conn = db.abrirBanco();
  const projeto = novoProjeto(conn);
  const githubClient = githubClientDePaginas([[pr(1, '2026-07-02T10:00:00Z')]]);

  let tique = 1000;
  const clock = () => {
    tique += 250;
    return tique;
  };

  await pollarProjeto({
    conn,
    projeto,
    githubClient,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso(),
    clock
  });

  const execucoes = db.listarExecucoes(conn, { projetoId: projeto.id });
  assert.equal(execucoes.length, 1);
  assert.ok(execucoes[0].duracao_ms > 0);
});

test('para de paginar quando updated_at cai antes da janela (evita varrer o histórico inteiro)', async () => {
  const conn = db.abrirBanco();
  const projeto = novoProjeto(conn, {});
  db.avancarCursor(conn, { projetoId: projeto.id, cursorIso: '2026-07-02T10:00:00Z' });
  const projetoComCursor = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });

  let paginasChamadas = 0;
  const githubClient = {
    listPullRequestFiles: async () => [],
    listPullRequestCommits: async () => [],
    listClosedPullRequestsPage: async (org, repo, { page }) => {
      paginasChamadas += 1;
      if (page === 1) return [pr(5, '2026-07-02T10:10:00Z', '2026-07-02T10:10:00Z')];
      // página 2 já é toda anterior à janela — não deveria nem ser hipoteticamente necessária
      return [pr(1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')];
    }
  };

  await pollarProjeto({
    conn,
    projeto: projetoComCursor,
    githubClient,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso(),
    overlapMinutos: 5
  });

  // como a página 1 inteira está dentro da janela, o poller ainda busca a
  // página 2 para confirmar que não há mais nada — o corte acontece DENTRO
  // da página cujo updated_at já é anterior à janela.
  assert.ok(paginasChamadas <= 2);
});

test('registro válido gerado pelo poller passa no schema', async () => {
  const conn = db.abrirBanco();
  const projeto = novoProjeto(conn);
  const githubClient = githubClientDePaginas([[pr(7, '2026-07-02T10:00:00Z')]]);

  await pollarProjeto({
    conn,
    projeto,
    githubClient,
    anthropicApiKey: 'fake-key',
    categorizarImpl: categorizarSucesso()
  });

  const { validateRegistro } = require('../../core/validate');
  const [linha] = db.listarRegistros(conn, { projetoId: projeto.id });
  const { valid, errors } = validateRegistro(linha.json);
  assert.equal(valid, true, errors.join('\n'));
  assert.equal(linha.json.origem, 'evento');
});
