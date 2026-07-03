'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../../dashboard/server');
const db = require('../../service/db');

const REGISTRO_101 = require('../../registros/2026/exemplo-repo/PR-101.json');

function configBase(overrides = {}) {
  return {
    devMode: false,
    oauthConfigurado: true,
    host: '127.0.0.1',
    port: 3000,
    oauthClientId: 'client-id',
    oauthClientSecret: 'client-secret',
    sessionSecret: 'segredo-de-teste',
    org: 'acme',
    baseUrl: 'http://localhost:3000',
    ...overrides
  };
}

function extrairCookie(response, nome) {
  const c = response.cookies.find((x) => x.name === nome);
  return c ? c.value : null;
}

test('sem sessão, rota protegida redireciona para /login', async () => {
  const fastify = buildServer({ config: configBase() });
  const res = await fastify.inject({ method: 'GET', url: '/dev' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/login');
});

test('modo dev sem OAuth: /dev acessível sem login, com banner de aviso', async () => {
  const fastify = buildServer({ config: configBase({ devMode: true, oauthConfigurado: false }) });
  const res = await fastify.inject({ method: 'GET', url: '/dev' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /MODO DEV/);
});

test('modo dev sem OAuth: /login redireciona direto para /dev (bypass)', async () => {
  const fastify = buildServer({ config: configBase({ devMode: true, oauthConfigurado: false }) });
  const res = await fastify.inject({ method: 'GET', url: '/login' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/dev');
});

test('fluxo OAuth completo: login -> callback com membro ativo -> sessão -> acesso liberado', async () => {
  const config = configBase();
  const fetchImpl = async (url) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      return { ok: true, json: async () => ({ access_token: 'user-token' }) };
    }
    if (url === 'https://api.github.com/user') {
      return { ok: true, json: async () => ({ login: 'maria' }) };
    }
    if (url === 'https://api.github.com/user/memberships/orgs/acme') {
      return { ok: true, status: 200, json: async () => ({ state: 'active' }) };
    }
    throw new Error(`URL inesperada: ${url}`);
  };
  const fastify = buildServer({ config, fetchImpl });

  const resLogin = await fastify.inject({ method: 'GET', url: '/login' });
  assert.equal(resLogin.statusCode, 302);
  const state = extrairCookie(resLogin, 'prr_oauth_state');
  assert.ok(state);
  assert.match(resLogin.headers.location, new RegExp(`state=${state}`));

  const resCallback = await fastify.inject({
    method: 'GET',
    url: `/auth/callback?code=abc123&state=${state}`,
    cookies: { prr_oauth_state: state }
  });
  assert.equal(resCallback.statusCode, 302);
  assert.equal(resCallback.headers.location, '/dev');
  const sessaoCookie = extrairCookie(resCallback, 'prr_session');
  assert.ok(sessaoCookie);

  const resDev = await fastify.inject({ method: 'GET', url: '/dev', cookies: { prr_session: sessaoCookie } });
  assert.equal(resDev.statusCode, 200);
});

test('callback com state divergente é rejeitado (proteção CSRF do próprio fluxo OAuth)', async () => {
  const fastify = buildServer({ config: configBase() });
  const res = await fastify.inject({
    method: 'GET',
    url: '/auth/callback?code=abc&state=valor-errado',
    cookies: { prr_oauth_state: 'valor-diferente' }
  });
  assert.equal(res.statusCode, 400);
});

test('usuário sem filiação ativa na organização é barrado com 403', async () => {
  const config = configBase();
  const fetchImpl = async (url) => {
    if (url === 'https://github.com/login/oauth/access_token') return { ok: true, json: async () => ({ access_token: 't' }) };
    if (url === 'https://api.github.com/user') return { ok: true, json: async () => ({ login: 'estranho' }) };
    if (url === 'https://api.github.com/user/memberships/orgs/acme') return { ok: false, status: 404 };
    throw new Error('inesperado');
  };
  const fastify = buildServer({ config, fetchImpl });
  const resLogin = await fastify.inject({ method: 'GET', url: '/login' });
  const state = extrairCookie(resLogin, 'prr_oauth_state');
  const res = await fastify.inject({
    method: 'GET',
    url: `/auth/callback?code=x&state=${state}`,
    cookies: { prr_oauth_state: state }
  });
  assert.equal(res.statusCode, 403);
});

test('admin: POST sem token CSRF é rejeitado com 403', async () => {
  const fastify = buildServer({ config: configBase({ devMode: true, oauthConfigurado: false }) });
  const res = await fastify.inject({
    method: 'POST',
    url: '/admin/projetos',
    payload: { org: 'org', repo: 'novo-repo' }
  });
  assert.equal(res.statusCode, 403);
});

test('admin: cadastro de projeto funciona com token CSRF válido', async () => {
  const dbConn = db.abrirBanco();
  const fastify = buildServer({ dbConn, config: configBase({ devMode: true, oauthConfigurado: false }) });

  const resAdmin = await fastify.inject({ method: 'GET', url: '/admin' });
  const csrf = extrairCookie(resAdmin, 'prr_csrf');
  assert.ok(csrf);
  assert.match(resAdmin.body, new RegExp(csrf));

  const resPost = await fastify.inject({
    method: 'POST',
    url: '/admin/projetos',
    cookies: { prr_csrf: csrf },
    payload: { org: 'org', repo: 'novo-repo', csrf }
  });
  assert.equal(resPost.statusCode, 302);
  assert.equal(resPost.headers.location, '/admin');

  const projetos = db.listarProjetos(dbConn);
  assert.ok(projetos.some((p) => p.repo === 'novo-repo'));
});

test('admin: toggle de comentar_pr também exige CSRF válido', async () => {
  const dbConn = db.abrirBanco();
  const id = db.cadastrarProjeto(dbConn, { org: 'org', repo: 'exemplo-repo', comentarPr: false });
  const fastify = buildServer({ dbConn, config: configBase({ devMode: true, oauthConfigurado: false }) });

  const resAdmin = await fastify.inject({ method: 'GET', url: '/admin' });
  const csrf = extrairCookie(resAdmin, 'prr_csrf');

  const semCsrf = await fastify.inject({
    method: 'POST',
    url: `/admin/projetos/${id}/comentar-pr`,
    payload: { comentarPr: 'true' }
  });
  assert.equal(semCsrf.statusCode, 403);

  const comCsrf = await fastify.inject({
    method: 'POST',
    url: `/admin/projetos/${id}/comentar-pr`,
    cookies: { prr_csrf: csrf },
    payload: { comentarPr: 'true', csrf }
  });
  assert.equal(comCsrf.statusCode, 302);
  assert.equal(db.buscarProjeto(dbConn, { org: 'org', repo: 'exemplo-repo' }).comentarPr, true);
});

test('/api/registros retorna JSON filtrado e autenticado', async () => {
  const dbConn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(dbConn, { org: 'org', repo: 'exemplo-repo' });
  db.inserirRegistroEAvancarCursor(dbConn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-101',
    registro: REGISTRO_101,
    novoCursorIso: null
  });
  const fastify = buildServer({ dbConn, config: configBase({ devMode: true, oauthConfigurado: false }) });
  const res = await fastify.inject({ method: 'GET', url: '/api/registros' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.length, 1);
  assert.equal(body[0].pr_id, 'PR-101');
});

test('/api/registros sem autenticação (produção) redireciona, não vaza dados', async () => {
  const fastify = buildServer({ config: configBase() });
  const res = await fastify.inject({ method: 'GET', url: '/api/registros' });
  assert.equal(res.statusCode, 302);
});

test('/export.md gera markdown para download', async () => {
  const dbConn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(dbConn, { org: 'org', repo: 'exemplo-repo' });
  db.inserirRegistroEAvancarCursor(dbConn, {
    projetoId,
    repo: 'exemplo-repo',
    prId: 'PR-101',
    registro: REGISTRO_101,
    novoCursorIso: null
  });
  const fastify = buildServer({ dbConn, config: configBase({ devMode: true, oauthConfigurado: false }) });
  const res = await fastify.inject({ method: 'GET', url: '/export.md' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-disposition'], /attachment/);
  assert.match(res.body, /## Resumo Geral/);
});

test('/gestor e /negocio respondem 200 autenticados', async () => {
  const fastify = buildServer({ config: configBase({ devMode: true, oauthConfigurado: false }) });
  const resGestor = await fastify.inject({ method: 'GET', url: '/gestor' });
  const resNegocio = await fastify.inject({ method: 'GET', url: '/negocio' });
  assert.equal(resGestor.statusCode, 200);
  assert.equal(resNegocio.statusCode, 200);
});
