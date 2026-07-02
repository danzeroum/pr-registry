'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverConfig, garantirArranqueSeguro } = require('../../dashboard/dev-mode');

test('critério: recusa subir sem OAuth configurado e fora do modo dev', () => {
  const config = resolverConfig({});
  assert.equal(config.oauthConfigurado, false);
  assert.equal(config.devMode, false);
  assert.throws(() => garantirArranqueSeguro(config), /Recusando iniciar/);
});

test('recusa mesmo com DASHBOARD_DEV_MODE ausente/false e só parte do OAuth configurado', () => {
  const config = resolverConfig({ GITHUB_OAUTH_CLIENT_ID: 'x' }); // faltam client_secret e session_secret
  assert.equal(config.oauthConfigurado, false);
  assert.throws(() => garantirArranqueSeguro(config), /Recusando iniciar/);
});

test('sobe em modo dev explícito sem OAuth, com bind restrito a 127.0.0.1', () => {
  const config = resolverConfig({ DASHBOARD_DEV_MODE: 'true' });
  assert.equal(config.devMode, true);
  assert.equal(config.host, '127.0.0.1');
  assert.doesNotThrow(() => garantirArranqueSeguro(config));
});

test('sobe em produção com OAuth totalmente configurado, bind 0.0.0.0 por padrão', () => {
  const config = resolverConfig({
    GITHUB_OAUTH_CLIENT_ID: 'id',
    GITHUB_OAUTH_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'segredo-longo'
  });
  assert.equal(config.oauthConfigurado, true);
  assert.equal(config.host, '0.0.0.0');
  assert.doesNotThrow(() => garantirArranqueSeguro(config));
});

test('DASHBOARD_HOST explícito é respeitado mesmo em modo dev', () => {
  const config = resolverConfig({ DASHBOARD_DEV_MODE: 'true', DASHBOARD_HOST: '0.0.0.0' });
  assert.equal(config.host, '0.0.0.0');
});

test('porta default é 3000, respeitando DASHBOARD_PORT quando definido', () => {
  assert.equal(resolverConfig({ DASHBOARD_DEV_MODE: 'true' }).port, 3000);
  assert.equal(resolverConfig({ DASHBOARD_DEV_MODE: 'true', DASHBOARD_PORT: '8080' }).port, 8080);
});
