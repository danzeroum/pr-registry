'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarTokenCsrf, tokenCsrfValido } = require('../../dashboard/csrf');

test('token gerado é válido contra si mesmo', () => {
  const token = gerarTokenCsrf();
  assert.equal(tokenCsrfValido(token, token), true);
});

test('rejeita quando o token do formulário não bate com o do cookie', () => {
  const tokenCookie = gerarTokenCsrf();
  const tokenFormulario = gerarTokenCsrf();
  assert.equal(tokenCsrfValido(tokenCookie, tokenFormulario), false);
});

test('rejeita quando falta um dos dois', () => {
  const token = gerarTokenCsrf();
  assert.equal(tokenCsrfValido(token, undefined), false);
  assert.equal(tokenCsrfValido(undefined, token), false);
  assert.equal(tokenCsrfValido(undefined, undefined), false);
});

test('dois tokens gerados são diferentes (aleatoriedade suficiente)', () => {
  const a = gerarTokenCsrf();
  const b = gerarTokenCsrf();
  assert.notEqual(a, b);
});
