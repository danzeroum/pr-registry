'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { verificarNegocioView } = require('../../dashboard/views/negocio-lint');

const NEGOCIO_PATH = path.join(__dirname, '..', '..', 'dashboard', 'views', 'negocio.js');

test('critério (linter de build): dashboard/views/negocio.js não referencia campos técnicos', () => {
  const codigo = fs.readFileSync(NEGOCIO_PATH, 'utf8');
  const { ok, violacoes } = verificarNegocioView(codigo);
  assert.equal(ok, true, `view de negócio referencia campos técnicos proibidos: ${violacoes.join(', ')}`);
});

test('o linter de fato detecta violações quando presentes (não é um teste vazio)', () => {
  const codigoRuim = `
    function render(r) {
      return r.acao.snippet + r.acao.camada + r.acao.justificativa;
    }
  `;
  const { ok, violacoes } = verificarNegocioView(codigoRuim);
  assert.equal(ok, false);
  assert.ok(violacoes.includes('snippet'));
  assert.ok(violacoes.includes('camada'));
  assert.ok(violacoes.includes('justificativa'));
});

test('o linter não falseia positivo em campos permitidos (descricao_gestor, resumo_gestor)', () => {
  const codigoBom = `
    function render(r) {
      return r.descricao_gestor + ' ' + r.resumo_gestor;
    }
  `;
  const { ok } = verificarNegocioView(codigoBom);
  assert.equal(ok, true);
});

test('ignora referências dentro de comentários (não falseia positivo no próprio arquivo de documentação da regra)', () => {
  const codigoComComentario = `
    // nunca acesse r.snippet ou r.camada aqui
    function render(r) {
      return r.resumo_gestor;
    }
  `;
  const { ok } = verificarNegocioView(codigoComComentario);
  assert.equal(ok, true);
});
