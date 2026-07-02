'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { codificarSessao, decodificarSessao } = require('../../dashboard/session');

const SECRET = 'segredo-de-teste-nao-use-em-producao';

test('codifica e decodifica um payload de sessão', () => {
  const cookie = codificarSessao({ login: 'maria', org: 'acme' }, SECRET);
  const payload = decodificarSessao(cookie, SECRET);
  assert.deepEqual(payload, { login: 'maria', org: 'acme' });
});

test('rejeita cookie com assinatura adulterada', () => {
  const cookie = codificarSessao({ login: 'maria' }, SECRET);
  const [payloadBase64] = cookie.split('.');
  const adulterado = `${payloadBase64}.assinaturaFalsa`;
  assert.equal(decodificarSessao(adulterado, SECRET), null);
});

test('rejeita cookie assinado com outro segredo (não pode ser forjado sem o segredo do servidor)', () => {
  const cookie = codificarSessao({ login: 'maria', membroOrg: true }, SECRET);
  assert.equal(decodificarSessao(cookie, 'outro-segredo'), null);
});

test('rejeita payload adulterado mesmo mantendo a assinatura original', () => {
  const cookie = codificarSessao({ login: 'maria', membroOrg: false }, SECRET);
  const [, assinatura] = cookie.split('.');
  const payloadForjado = Buffer.from(JSON.stringify({ login: 'maria', membroOrg: true })).toString('base64url');
  const cookieForjado = `${payloadForjado}.${assinatura}`;
  assert.equal(decodificarSessao(cookieForjado, SECRET), null);
});

test('retorna null para cookie ausente ou malformado', () => {
  assert.equal(decodificarSessao(undefined, SECRET), null);
  assert.equal(decodificarSessao('', SECRET), null);
  assert.equal(decodificarSessao('sem-ponto', SECRET), null);
  assert.equal(decodificarSessao('a.b.c', SECRET), null);
});

test('respeita expiração do payload', () => {
  const cookieExpirado = codificarSessao({ login: 'maria', expiraEm: Date.now() - 1000 }, SECRET);
  assert.equal(decodificarSessao(cookieExpirado, SECRET), null);

  const cookieValido = codificarSessao({ login: 'maria', expiraEm: Date.now() + 60000 }, SECRET);
  assert.ok(decodificarSessao(cookieValido, SECRET));
});
