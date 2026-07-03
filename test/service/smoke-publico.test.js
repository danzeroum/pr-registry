'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../service/db');
const { runSmoke } = require('../../service/smoke-publico');

// Rede real está bloqueada neste ambiente de desenvolvimento (proxy da
// sessão retorna 403 até para GET não autenticado em api.github.com — ver
// docs/validacao-viva.md). Este teste prova a lógica de paginação real do
// smoke (>1 página) contra um `fetch` mockado nível-HTTP — o mais perto de
// "rede real" que dá para chegar sem sair deste sandbox. A execução contra
// o GitHub de verdade é o próprio propósito de `node service/smoke-publico.js`
// rodado manualmente fora daqui.

function prApi(number, mergedAt) {
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

function fakeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

test('smoke sem credenciais pagina de verdade (>1 página) e cai em modo degradado ponta a ponta', async () => {
  const paginas = {
    'page=1': [prApi(3, '2026-07-02T10:03:00Z'), prApi(2, '2026-07-02T10:02:00Z')],
    'page=2': [prApi(1, '2026-07-02T10:01:00Z')],
    'page=3': []
  };

  const chamadasSemAuth = [];
  const fetchImpl = async (url, options) => {
    chamadasSemAuth.push(Boolean(options?.headers?.authorization));
    if (url.includes('/pulls/') && url.includes('/files')) return fakeResponse([{ filename: 'a.ts', patch: '+x' }]);
    if (url.includes('/pulls/') && url.includes('/commits')) return fakeResponse([{ commit: { message: 'feat: x' } }]);
    if (url.includes('page=1')) return fakeResponse(paginas['page=1']);
    if (url.includes('page=2')) return fakeResponse(paginas['page=2']);
    return fakeResponse(paginas['page=3']);
  };

  const conn = db.abrirBanco();
  const resultado = await runSmoke({ repoFull: 'octocat/Hello-World', perPage: 2, fetchImpl, conn });

  assert.ok(resultado.paginasPercorridas >= 2, `esperava >=2 páginas, obteve ${resultado.paginasPercorridas}`);
  assert.equal(resultado.registrosGravados, 3);
  assert.equal(resultado.todosDegradados, true);
  assert.ok(chamadasSemAuth.every((tinhaAuth) => tinhaAuth === false), 'nenhuma chamada deve levar Authorization — smoke é não autenticado');
});

test('lança erro claro se nenhum fetch estiver disponível', async () => {
  // `null`, não `undefined` — undefined dispararia o default do parâmetro
  // (o fetch global do runtime), que faria uma chamada de rede real.
  await assert.rejects(
    () => runSmoke({ repoFull: 'org/repo', fetchImpl: null, conn: db.abrirBanco() }),
    /nenhum fetch disponível/
  );
});
