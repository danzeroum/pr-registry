'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAuthorizeUrl,
  exchangeCodeForAccessToken,
  verificarMembroDaOrg,
  buscarUsuarioAutenticado
} = require('../../dashboard/auth');

test('monta a URL de autorização com escopo read:org', () => {
  const url = buildAuthorizeUrl({ clientId: 'abc', redirectUri: 'https://x/callback', state: 'xyz' });
  assert.match(url, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  assert.match(url, /scope=read%3Aorg/);
  assert.match(url, /state=xyz/);
});

test('troca o código por access token', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    const body = JSON.parse(options.body);
    assert.equal(body.code, 'codigo-123');
    return { ok: true, json: async () => ({ access_token: 'user-token-abc' }) };
  };
  const token = await exchangeCodeForAccessToken({
    clientId: 'id',
    clientSecret: 'secret',
    code: 'codigo-123',
    redirectUri: 'https://x/callback',
    fetchImpl
  });
  assert.equal(token, 'user-token-abc');
});

test('lança erro se o GitHub retornar um erro no corpo do token exchange', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ error: 'bad_verification_code', error_description: 'código expirado' })
  });
  await assert.rejects(
    () => exchangeCodeForAccessToken({ clientId: 'id', clientSecret: 's', code: 'x', redirectUri: 'r', fetchImpl }),
    /código expirado/
  );
});

test('critério: verifica membro usando GET /user/memberships/orgs/{org} com o token do próprio usuário — funciona com filiação privada', async () => {
  let urlChamada;
  let authorizationRecebido;
  const fetchImpl = async (url, options) => {
    urlChamada = url;
    authorizationRecebido = options.headers.authorization;
    // GitHub retorna a filiação (mesmo privada) quando é o PRÓPRIO usuário
    // consultando com seu token — diferente de GET /orgs/{org}/members/{user},
    // que exigiria a filiação ser pública ou um token administrativo.
    return { ok: true, status: 200, json: async () => ({ state: 'active', role: 'member' }) };
  };

  const resultado = await verificarMembroDaOrg({
    userAccessToken: 'token-do-usuario',
    org: 'acme',
    login: 'maria',
    fetchImpl
  });

  assert.equal(urlChamada, 'https://api.github.com/user/memberships/orgs/acme');
  assert.equal(authorizationRecebido, 'Bearer token-do-usuario');
  assert.equal(resultado.membro, true);
  assert.equal(resultado.estado, 'active');
});

test('convite pendente (state: pending) não concede acesso', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ state: 'pending' }) });
  const resultado = await verificarMembroDaOrg({ userAccessToken: 't', org: 'acme', login: 'x', fetchImpl });
  assert.equal(resultado.membro, false);
});

test('404 (não é membro) retorna membro: false sem lançar', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  const resultado = await verificarMembroDaOrg({ userAccessToken: 't', org: 'acme', login: 'x', fetchImpl });
  assert.equal(resultado.membro, false);
});

test('erro inesperado da API lança (não silencia como "não é membro")', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  await assert.rejects(() => verificarMembroDaOrg({ userAccessToken: 't', org: 'acme', login: 'x', fetchImpl }), /500/);
});

test('busca o usuário autenticado', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.github.com/user');
    assert.equal(options.headers.authorization, 'Bearer tok');
    return { ok: true, json: async () => ({ login: 'maria', id: 1 }) };
  };
  const user = await buscarUsuarioAutenticado({ userAccessToken: 'tok', fetchImpl });
  assert.equal(user.login, 'maria');
});
