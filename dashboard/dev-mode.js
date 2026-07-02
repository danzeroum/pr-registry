'use strict';

/**
 * Resolve a configuração de arranque a partir do ambiente e decide se o
 * servidor pode subir. Regra dura: sem OAuth configurado, o servidor SÓ
 * sobe em modo dev explícito (DASHBOARD_DEV_MODE=true) — nunca um
 * fallback silencioso para "aberto". Em modo dev, o bind também é
 * restrito a 127.0.0.1 por padrão (um banner na página não protege nada
 * se o processo estiver escutando em 0.0.0.0 numa máquina com IP
 * alcançável).
 */
function resolverConfig(env = process.env) {
  const devMode = env.DASHBOARD_DEV_MODE === 'true';
  const oauthConfigurado = Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && env.SESSION_SECRET);

  const host = env.DASHBOARD_HOST || (devMode ? '127.0.0.1' : '0.0.0.0');
  const port = Number(env.DASHBOARD_PORT || 3000);

  return {
    devMode,
    oauthConfigurado,
    host,
    port,
    oauthClientId: env.GITHUB_OAUTH_CLIENT_ID || null,
    oauthClientSecret: env.GITHUB_OAUTH_CLIENT_SECRET || null,
    sessionSecret: env.SESSION_SECRET || (devMode ? 'dev-mode-nao-use-em-producao' : null),
    org: env.GITHUB_ORG || null,
    baseUrl: env.DASHBOARD_BASE_URL || `http://localhost:${port}`,
    dbPath: env.DASHBOARD_DB_PATH || ':memory:'
  };
}

/**
 * Lança se a combinação de config for insegura. Chamar antes de
 * `fastify.listen()` — nunca deixar o processo subir e servir tráfego
 * primeiro.
 */
function garantirArranqueSeguro(config) {
  if (!config.oauthConfigurado && !config.devMode) {
    throw new Error(
      'Recusando iniciar: GITHUB_OAUTH_CLIENT_ID/GITHUB_OAUTH_CLIENT_SECRET/SESSION_SECRET ausentes e ' +
        'DASHBOARD_DEV_MODE não é "true". O dashboard nunca sobe sem autenticação por padrão — defina ' +
        'DASHBOARD_DEV_MODE=true explicitamente para rodar localmente sem OAuth (bind fica restrito a ' +
        '127.0.0.1), ou configure o OAuth App para produção.'
    );
  }
  if (config.devMode && !config.oauthConfigurado && config.host !== '127.0.0.1' && !process.env.DASHBOARD_HOST) {
    // defesa extra: se por algum motivo host não ficou 127.0.0.1 apesar do
    // devMode e ninguém pediu explicitamente outro host, é um bug de
    // configuração — falhar alto em vez de expor.
    throw new Error('Modo dev sem OAuth deve fazer bind em 127.0.0.1 por padrão — configuração inconsistente.');
  }
}

module.exports = { resolverConfig, garantirArranqueSeguro };
