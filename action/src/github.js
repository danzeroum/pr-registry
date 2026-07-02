'use strict';

const API_BASE = 'https://api.github.com';

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28'
  };
}

async function request(fetchImpl, token, method, path, body) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: { ...headers(token), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${method} ${path} respondeu ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Cliente mínimo da API REST do GitHub, com fetch injetável para testes.
 * Cobre só as operações que a Action usa — não é um SDK genérico.
 */
function createGithubClient({ token, fetchImpl = fetch }) {
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
      request(fetchImpl, token, 'POST', `/repos/${owner}/${repo}/issues`, { title, body, labels })
  };
}

module.exports = { createGithubClient, API_BASE };
