'use strict';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_BASE = 'https://api.github.com';

function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:org',
    state
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForAccessToken({ clientId, clientSecret, code, redirectUri, fetchImpl = fetch }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri })
  });
  if (!res.ok) {
    throw new Error(`GitHub OAuth token exchange respondeu ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`GitHub OAuth token exchange falhou: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

/**
 * Verifica se o usuário autenticado é membro da organização usando o
 * TOKEN DO PRÓPRIO USUÁRIO (escopo read:org) contra
 * GET /user/memberships/orgs/{org} — NUNCA GET /orgs/{org}/members/{user},
 * que só enxerga filiação PÚBLICA (a maioria dos membros tem filiação
 * privada por padrão, e ficariam barrados do próprio dashboard com esse
 * endpoint errado).
 *
 * Retorna { membro: true, estado: 'active' } quando é membro ativo,
 * { membro: false } quando não é membro (404) ou o convite ainda está
 * pendente (estado 'pending' não dá acesso).
 */
async function verificarMembroDaOrg({ userAccessToken, org, login, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API_BASE}/user/memberships/orgs/${org}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${userAccessToken}`,
      'x-github-api-version': '2022-11-28'
    }
  });

  if (res.status === 404) {
    return { membro: false, login };
  }
  if (!res.ok) {
    throw new Error(`GitHub API /user/memberships/orgs/${org} respondeu ${res.status}`);
  }

  const data = await res.json();
  return { membro: data.state === 'active', estado: data.state, login };
}

async function buscarUsuarioAutenticado({ userAccessToken, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API_BASE}/user`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${userAccessToken}`,
      'x-github-api-version': '2022-11-28'
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub API /user respondeu ${res.status}`);
  }
  return res.json();
}

module.exports = { buildAuthorizeUrl, exchangeCodeForAccessToken, verificarMembroDaOrg, buscarUsuarioAutenticado };
