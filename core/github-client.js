'use strict';

const API_BASE = 'https://api.github.com';

function headers(token) {
  const base = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28'
  };
  // Sem token: chamadas não autenticadas contra repositórios públicos
  // funcionam normalmente (limite de 60 req/h) — é o modo usado pelo smoke
  // test sem credenciais (ver service/smoke-publico.js). A credencial
  // (nenhuma / PAT / token de GitHub App) é sempre injetável, nunca
  // hard-coded, para que a troca de uma para outra seja só configuração.
  return token ? { ...base, authorization: `Bearer ${token}` } : base;
}

async function request(fetchImpl, token, method, path, body) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: { ...headers(token), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const erro = new Error(`GitHub API ${method} ${path} respondeu ${res.status}: ${text}`);
    erro.status = res.status;
    erro.isRateLimit =
      res.status === 429 || (res.status === 403 && /rate limit/i.test(text));
    const reset = res.headers?.get?.('x-ratelimit-reset');
    if (reset) erro.rateLimitResetEpochSeconds = Number(reset);
    throw erro;
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Cliente mínimo da API REST do GitHub, com fetch e token injetáveis para
 * testes e para os três modos de credencial (sem token, PAT, token de App)
 * — cobre só as operações que a Action e o poller usam, não é um SDK
 * genérico.
 */
function createGithubClient({ token, fetchImpl = fetch } = {}) {
  return {
    listPullRequestFiles: (owner, repo, prNumber) =>
      request(fetchImpl, token, 'GET', `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`),
    listPullRequestCommits: (owner, repo, prNumber) =>
      request(fetchImpl, token, 'GET', `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`),
    listIssueComments: (owner, repo, prNumber) =>
      request(fetchImpl, token, 'GET', `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`),
    createIssueComment: (owner, repo, prNumber, body) =>
      request(fetchImpl, token, 'POST', `/repos/${owner}/${repo}/issues/${prNumber}/comments`, { body }),
    updateIssueComment: (owner, repo, commentId, body) =>
      request(fetchImpl, token, 'PATCH', `/repos/${owner}/${repo}/issues/comments/${commentId}`, { body }),
    createIssue: (owner, repo, title, body, labels) =>
      request(fetchImpl, token, 'POST', `/repos/${owner}/${repo}/issues`, { title, body, labels }),
    // Usado pelo poller (Fase 3): uma página de PRs fechados, mais recentes
    // primeiro por data de atualização — o poller filtra os mergeados e
    // pagina até passar do cursor.
    listClosedPullRequestsPage: (owner, repo, { perPage = 30, page = 1 } = {}) =>
      request(
        fetchImpl,
        token,
        'GET',
        `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${perPage}&page=${page}`
      ),
    // Usado pelo reprocessamento de registros degradados: busca de novo os
    // dados de um PR específico pelo número quando a categorização precisa
    // ser refeita com a API key disponível.
    getPullRequest: (owner, repo, prNumber) =>
      request(fetchImpl, token, 'GET', `/repos/${owner}/${repo}/pulls/${prNumber}`)
  };
}

module.exports = { createGithubClient, API_BASE };
