'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scrubText, scrubObject, REDACTED } = require('../scripts/scrub.js');

test('detecta e redige AWS access key', () => {
  const { text, totalMatches } = scrubText('AWS_KEY=AKIAABCDEFGHIJKLMNOP');
  assert.ok(text.includes(REDACTED));
  assert.equal(totalMatches >= 1, true);
});

test('detecta e redige token do GitHub', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  const { text, matches } = scrubText(`token: ${token}`);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.github_token >= 1);
});

test('detecta e redige JWT', () => {
  const jwt =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const { text, matches } = scrubText(`Authorization: Bearer ${jwt}`);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.jwt >= 1);
});

test('detecta e redige bloco de chave privada', () => {
  const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIBAAKC...\n-----END RSA PRIVATE KEY-----';
  const { text, matches } = scrubText(key);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.private_key_block >= 1);
});

test('detecta atribuição genérica de senha/segredo', () => {
  const { text, matches } = scrubText('password: "SuperSecreta123"');
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.generic_assignment_secret >= 1);
});

test('detecta connection string com credenciais', () => {
  const { text, matches } = scrubText('DATABASE_URL=postgres://user:s3nh4@db.host:5432/prod');
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.connection_string >= 1);
});

test('detecta token do Slack', () => {
  const { text, matches } = scrubText('xoxb-1234567890-abcdefghijk');
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.slack_token >= 1);
});

test('não falseia positivo em texto comum', () => {
  const texto =
    'Este PR corrige o cálculo de frete para a região Norte e adiciona testes automatizados.';
  const { text, totalMatches } = scrubText(texto);
  assert.equal(totalMatches, 0);
  assert.equal(text, texto);
});

test('scrubObject limpa recursivamente strings em objetos/arrays', () => {
  const obj = {
    descricao: 'Configura variável AWS_KEY=AKIAABCDEFGHIJKLMNOP no ambiente',
    arquivos: ['a.ts', 'b.ts'],
    nested: { nota: 'sem segredo aqui' }
  };
  const { value, totalMatches } = scrubObject(obj);
  assert.ok(value.descricao.includes(REDACTED));
  assert.equal(value.nested.nota, 'sem segredo aqui');
  assert.ok(totalMatches >= 1);
});

test('scrubText lida com string vazia', () => {
  const { text, totalMatches } = scrubText('');
  assert.equal(text, '');
  assert.equal(totalMatches, 0);
});
