'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scrubText, scrubObject, REDACTED } = require('../scripts/scrub.js');

// Todas as strings de segredo abaixo são fictícias e montadas por
// concatenação em tempo de execução — nenhum segredo real ou
// contiguamente reconhecível como um deve existir no código-fonte,
// para não disparar o secret scanning do próprio GitHub nesta repo.

test('detecta e redige AWS access key', () => {
  const fakeKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const { text, totalMatches } = scrubText(`AWS_KEY=${fakeKey}`);
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
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join(
    '.'
  );
  const { text, matches } = scrubText(`Authorization: Bearer ${jwt}`);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.jwt >= 1);
});

test('detecta e redige bloco de chave privada', () => {
  const key = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIBAAKC...', '-----END RSA PRIVATE KEY-----'].join('\n');
  const { text, matches } = scrubText(key);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.private_key_block >= 1);
});

test('detecta atribuição genérica de senha/segredo', () => {
  const { text, matches } = scrubText('password: "' + 'SuperSecreta123' + '"');
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.generic_assignment_secret >= 1);
});

test('detecta connection string com credenciais', () => {
  const fakePass = 's3nh4';
  const { text, matches } = scrubText(`DATABASE_URL=postgres://user:${fakePass}@db.host:5432/prod`);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.connection_string >= 1);
});

test('detecta token do Slack', () => {
  const fakeToken = 'xoxb-' + '1234567890-abcdefghijk';
  const { text, matches } = scrubText(fakeToken);
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
  const fakeKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const obj = {
    descricao: `Configura variável AWS_KEY=${fakeKey} no ambiente`,
    arquivos: ['a.ts', 'b.ts'],
    nested: { nota: 'sem segredo aqui' }
  };
  const { value, totalMatches } = scrubObject(obj);
  assert.ok(value.descricao.includes(REDACTED));
  assert.equal(value.nested.nota, 'sem segredo aqui');
  assert.ok(totalMatches >= 1);
});

test('detecta chave da Anthropic embutida em snippet de código sem nome de variável óbvio', () => {
  const fakeKey = 'sk-ant-api03-' + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const snippet = `const key = "${fakeKey}";`;
  const { text, matches } = scrubText(snippet);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.anthropic_api_key >= 1);
});

test('detecta chave da OpenAI embutida em snippet de código', () => {
  const fakeKey = 'sk-proj-' + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  const snippet = `const OPENAI_KEY = "${fakeKey}";`;
  const { text, matches } = scrubText(snippet);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.openai_api_key >= 1);
});

test('detecta token Bearer em cabeçalho sem variável nomeada', () => {
  const fakeToken = 'sk-live-' + '4242424242424242';
  const snippet = 'headers: { Authorization: `Bearer ' + fakeToken + '` }';
  const { text, matches } = scrubText(snippet);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.bearer_token >= 1);
});

test('detecta segredo em variável camelCase que não bate palavra inteira (stripeSecret)', () => {
  const fakeKey = 'sk_live_' + '51H8xN2eZvKYlo2C0abcdefghijklmnop';
  const snippet = `const stripeSecret = "${fakeKey}";`;
  const { text, matches } = scrubText(snippet);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.stripe_key >= 1 || matches.generic_assignment_secret >= 1);
});

test('detecta chave de API do Google', () => {
  const fakeKey = 'AIza' + 'SyD-9tSrke72PouQMnMX-a7eZSW0jkFMBc';
  const snippet = `const apiKey = "${fakeKey}";`;
  const { text, matches } = scrubText(snippet);
  assert.ok(text.includes(REDACTED));
  assert.ok(matches.google_api_key >= 1 || matches.generic_assignment_secret >= 1);
});

test('scrubText lida com string vazia', () => {
  const { text, totalMatches } = scrubText('');
  assert.equal(text, '');
  assert.equal(totalMatches, 0);
});
