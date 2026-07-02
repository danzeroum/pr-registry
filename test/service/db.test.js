'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../service/db');

function registroFake(prId, overrides = {}) {
  return {
    schema_version: '1.2',
    pr_id: prId,
    repo: 'exemplo-repo',
    titulo_pr: 'x',
    requisito: { id: 'nao-vinculado', fonte: 'nao_vinculado', titulo: '' },
    autor_dev: 'alguem',
    gerado_por_ia: false,
    data_merge: '2026-07-02T10:00:00Z',
    status_pr: 'mergeado',
    modo: 'completo',
    origem: 'evento',
    acoes: [],
    resumo_geral: 'x',
    resumo_gestor: 'x',
    pendencias: [],
    tags: [],
    ...overrides
  };
}

test('cadastra projeto e recupera por org/repo', () => {
  const conn = db.abrirBanco();
  const id = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo', padroesRequisito: ['XYZ-(\\d+)'] });
  const projeto = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  assert.equal(projeto.id, id);
  assert.deepEqual(projeto.padroesRequisito, ['XYZ-(\\d+)']);
  assert.equal(projeto.cursorIso, null);
});

test('insere registro e avança cursor na mesma transação', () => {
  const conn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });

  const resultado = db.inserirRegistroEAvancarCursor(conn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-1',
    registro: registroFake('PR-1'),
    novoCursorIso: '2026-07-02T10:00:00Z'
  });

  assert.equal(resultado.inserted, true);
  assert.equal(db.registroExiste(conn, { repo: 'exemplo-repo', prId: 'PR-1' }), true);
  const projeto = db.buscarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  assert.equal(projeto.cursorIso, '2026-07-02T10:00:00Z');
});

test('UNIQUE(repo, pr_id): inserir o mesmo PR duas vezes não duplica (idempotência)', () => {
  const conn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });

  db.inserirRegistroEAvancarCursor(conn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-1',
    registro: registroFake('PR-1'),
    novoCursorIso: '2026-07-02T10:00:00Z'
  });

  // simula reprocessamento da janela de sobreposição do cursor
  const segunda = db.inserirRegistroEAvancarCursor(conn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-1',
    registro: registroFake('PR-1'),
    novoCursorIso: '2026-07-02T10:00:00Z'
  });

  assert.equal(segunda.inserted, false, 'segunda inserção deve ser um no-op (INSERT OR IGNORE)');
  const registros = db.listarRegistros(conn, { projetoId });
  assert.equal(registros.length, 1);
});

test('atualizarRegistro sobrescreve um registro degradado após reprocessamento', () => {
  const conn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  db.inserirRegistroEAvancarCursor(conn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-1',
    registro: registroFake('PR-1', { modo: 'degradado' }),
    novoCursorIso: null
  });

  const [antes] = db.listarRegistros(conn, { projetoId });

  const atualizado = registroFake('PR-1', { modo: 'completo' });
  const resultado = db.atualizarRegistro(conn, { repo: 'exemplo-repo', prId: 'PR-1', registro: atualizado });
  assert.equal(resultado.updated, true);

  const [linha] = db.listarRegistros(conn, { projetoId });
  assert.equal(linha.modo, 'completo');
  assert.equal(linha.json.modo, 'completo');

  // prova de que é a MESMA linha atualizada (caminho de UPDATE), não uma
  // segunda linha inserida: id e criado_em preservados, atualizado_em
  // avança (nunca regride) — é isso que distingue este caminho do
  // INSERT OR IGNORE usado por inserirRegistroEAvancarCursor.
  assert.equal(linha.id, antes.id);
  assert.equal(linha.criado_em, antes.criado_em);
  assert.ok(new Date(linha.atualizado_em).getTime() >= new Date(antes.atualizado_em).getTime());
  assert.equal(db.listarRegistros(conn, { projetoId }).length, 1, 'não deve haver uma segunda linha');
});

test('listarRegistrosDegradados retorna só os pendentes de reprocessamento', () => {
  const conn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  db.inserirRegistroEAvancarCursor(conn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-1',
    registro: registroFake('PR-1', { modo: 'degradado' }),
    novoCursorIso: null
  });
  db.inserirRegistroEAvancarCursor(conn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-2',
    registro: registroFake('PR-2', { modo: 'completo' }),
    novoCursorIso: null
  });

  const degradados = db.listarRegistrosDegradados(conn);
  assert.equal(degradados.length, 1);
  assert.equal(degradados[0].pr_id, 'PR-1');
});

test('registrarExecucao e listarExecucoes guardam prs_processados, erros e duracao_ms', () => {
  const conn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  db.registrarExecucao(conn, { projetoId, prsProcessados: 3, erros: [], duracaoMs: 1234 });
  db.registrarExecucao(conn, { projetoId, prsProcessados: 0, erros: ['rate limit'], duracaoMs: 500 });

  const execucoes = db.listarExecucoes(conn, { projetoId });
  assert.equal(execucoes.length, 2);
  assert.equal(execucoes[0].prs_processados, 3);
  assert.equal(execucoes[0].duracao_ms, 1234);
  assert.deepEqual(execucoes[1].erros, ['rate limit']);
});

test('bancos em memória distintos ficam isolados', () => {
  const conn1 = db.abrirBanco();
  const conn2 = db.abrirBanco();
  db.cadastrarProjeto(conn1, { org: 'org', repo: 'a' });
  assert.equal(db.listarProjetos(conn1).length, 1);
  assert.equal(db.listarProjetos(conn2).length, 0);
});
