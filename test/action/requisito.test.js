'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extrairRequisito } = require('../../action/src/requisito');

test('extrai requisito #123 do título com prioridade sobre branch/descrição', () => {
  const r = extrairRequisito({
    titulo: 'Corrige bug de sessão (#123)',
    branch: 'fix/PROJ-999-outra-coisa',
    descricao: 'req:should-not-be-used'
  });
  assert.deepEqual(r, { id: '123', fonte: 'titulo_pr', titulo: '' });
});

test('cai para branch quando título não tem referência', () => {
  const r = extrairRequisito({
    titulo: 'Corrige bug de sessão',
    branch: 'fix/PROJ-999-outra-coisa',
    descricao: ''
  });
  assert.deepEqual(r, { id: 'PROJ-999', fonte: 'branch', titulo: '' });
});

test('cai para descrição quando título e branch não têm referência', () => {
  const r = extrairRequisito({
    titulo: 'Corrige bug de sessão',
    branch: 'fix/sessao',
    descricao: 'Relacionado a req:abc-123'
  });
  assert.deepEqual(r, { id: 'abc-123', fonte: 'descricao_pr', titulo: '' });
});

test('retorna não-vinculado quando nada é encontrado', () => {
  const r = extrairRequisito({ titulo: 'Ajuste de CSS', branch: 'fix/css', descricao: 'Sem referência.' });
  assert.deepEqual(r, { id: 'nao-vinculado', fonte: 'nao_vinculado', titulo: '' });
});

test('aceita padrões customizados via configuração do repo', () => {
  const r = extrairRequisito({
    titulo: 'Implementa feature XYZ-42',
    branch: '',
    descricao: '',
    patterns: [/XYZ-(\d+)/]
  });
  assert.deepEqual(r, { id: '42', fonte: 'titulo_pr', titulo: '' });
});
