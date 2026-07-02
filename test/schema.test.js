'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateRegistro } = require('../scripts/validate.js');

const EXEMPLOS_DIR = path.join(__dirname, '..', 'registros', '2026', 'exemplo-repo');

function loadExemplo(nome) {
  const raw = fs.readFileSync(path.join(EXEMPLOS_DIR, nome), 'utf8');
  return JSON.parse(raw);
}

test('PR-101 (IA, requisito vinculado via título) é válido', () => {
  const registro = loadExemplo('PR-101.json');
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
});

test('PR-102 (humano, requisito vinculado via branch) é válido', () => {
  const registro = loadExemplo('PR-102.json');
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
});

test('PR-103 (sem requisito, não-vinculado) é válido', () => {
  const registro = loadExemplo('PR-103.json');
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, true, errors.join('\n'));
  assert.equal(registro.requisito.fonte, 'nao_vinculado');
  assert.ok(registro.pendencias.length > 0);
});

test('rejeita ação sem justificativa', () => {
  const registro = loadExemplo('PR-101.json');
  registro.acoes[0].justificativa = '';
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('justificativa')));
});

test('rejeita camada fora do enum', () => {
  const registro = loadExemplo('PR-101.json');
  registro.acoes[0].camada = 'nao_existe';
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('rejeita tipo fora do enum', () => {
  const registro = loadExemplo('PR-101.json');
  registro.acoes[0].tipo = 'invalido';
  const { valid } = validateRegistro(registro);
  assert.equal(valid, false);
});

test('rejeita snippet com mais de 10 linhas', () => {
  const registro = loadExemplo('PR-101.json');
  registro.acoes[0].snippet = Array.from({ length: 15 }, (_, i) => `linha ${i}`).join('\n');
  const { valid, errors } = validateRegistro(registro);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('excede o limite')));
});

test('rejeita registro sem campos obrigatórios', () => {
  const { valid, errors } = validateRegistro({ pr_id: 'PR-999' });
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('rejeita modo fora do enum completo/degradado', () => {
  const registro = loadExemplo('PR-101.json');
  registro.modo = 'parcial';
  const { valid } = validateRegistro(registro);
  assert.equal(valid, false);
});
