'use strict';

/**
 * Resolve a credencial de leitura do GitHub a partir do ambiente, na ordem
 * de preferência: token de GitHub App já mintado > PAT > nenhum token
 * (chamadas não autenticadas, só repositórios públicos, 60 req/h).
 *
 * O poller/service nunca precisa saber QUAL credencial está em uso — troca
 * de "sem token" para PAT para App é só configuração (variável de
 * ambiente), nenhuma linha de código muda (ver docs/validacao-viva.md).
 */
function resolveGithubToken(env = process.env) {
  if (env.PR_REGISTRY_APP_TOKEN) {
    return { token: env.PR_REGISTRY_APP_TOKEN, modo: 'github-app' };
  }
  if (env.PR_REGISTRY_PAT) {
    return { token: env.PR_REGISTRY_PAT, modo: 'pat' };
  }
  return { token: undefined, modo: 'nao-autenticado' };
}

module.exports = { resolveGithubToken };
