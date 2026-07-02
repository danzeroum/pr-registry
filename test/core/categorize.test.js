'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { categorizar, parseJson } = require('../../core/categorize');

const EXEMPLO_VALIDO = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'registros', '2026', 'exemplo-repo', 'PR-101.json'), 'utf8')
);

test('retorna registro válido na primeira tentativa', async () => {
  let chamadas = 0;
  const callClaudeImpl = async () => {
    chamadas += 1;
    return JSON.stringify(EXEMPLO_VALIDO);
  };
  const { registro, tentativas } = await categorizar({
    payload: { titulo: 'x' },
    apiKey: 'fake-key',
    callClaudeImpl,
    systemPrompt: 'system prompt de teste'
  });
  assert.equal(tentativas, 1);
  assert.equal(chamadas, 1);
  assert.equal(registro.pr_id, 'PR-101');
});

test('faz retry com feedback do erro quando a primeira resposta é inválida', async () => {
  const respostas = [
    JSON.stringify({ pr_id: 'PR-999' }), // inválido: faltam campos obrigatórios
    JSON.stringify(EXEMPLO_VALIDO) // válido na segunda tentativa
  ];
  const promptsRecebidos = [];
  const callClaudeImpl = async ({ userPrompt }) => {
    promptsRecebidos.push(userPrompt);
    return respostas.shift();
  };
  const { registro, tentativas } = await categorizar({
    payload: { titulo: 'x' },
    apiKey: 'fake-key',
    callClaudeImpl,
    systemPrompt: 'system prompt de teste'
  });
  assert.equal(tentativas, 2);
  assert.equal(registro.pr_id, 'PR-101');
  assert.match(promptsRecebidos[1], /SUA RESPOSTA ANTERIOR FALHOU NA VALIDAÇÃO DE SCHEMA/);
});

test('lança erro após esgotar o máximo de tentativas (2)', async () => {
  const callClaudeImpl = async () => JSON.stringify({ pr_id: 'PR-999' });
  let chamadas = 0;
  const wrapped = async (args) => {
    chamadas += 1;
    return callClaudeImpl(args);
  };
  await assert.rejects(
    () =>
      categorizar({
        payload: { titulo: 'x' },
        apiKey: 'fake-key',
        callClaudeImpl: wrapped,
        systemPrompt: 'system prompt de teste'
      }),
    /Categorização falhou após retries/
  );
  assert.equal(chamadas, 2);
});

test('trata resposta não-JSON como falha e tenta novamente', async () => {
  const respostas = ['isto não é JSON', JSON.stringify(EXEMPLO_VALIDO)];
  const callClaudeImpl = async () => respostas.shift();
  const { tentativas } = await categorizar({
    payload: { titulo: 'x' },
    apiKey: 'fake-key',
    callClaudeImpl,
    systemPrompt: 'system prompt de teste'
  });
  assert.equal(tentativas, 2);
});

test('parseJson extrai o primeiro bloco {} mesmo com texto extra ao redor', () => {
  const texto = 'Aqui está: ' + JSON.stringify({ a: 1 }) + ' -- fim';
  assert.deepEqual(parseJson(texto), { a: 1 });
});
