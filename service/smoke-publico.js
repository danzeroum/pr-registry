'use strict';

const { createGithubClient } = require('../core/github-client');
const db = require('./db');
const { pollarProjeto } = require('./poller');

/**
 * Smoke test sem credenciais (RF12 / débito de "credenciais adiadas" — ver
 * docs/validacao-viva.md): roda o poller de verdade, sem token, contra um
 * repositório PÚBLICO, usando a API não autenticada do GitHub (limite de
 * 60 req/h). Não chama a Anthropic — todo PR processado cai em modo
 * degradado por design, o que também exercita esse caminho ponta a ponta.
 *
 * Cobre: paginação real (se o repo tiver mais PRs fechados que `perPage`),
 * extração de requisito, truncamento de diff, scrubbing, persistência
 * idempotente e o registro de execucoes_poller.
 *
 * NÃO cobre (requer credencial — ver docs/validacao-viva.md):
 * categorização real via Anthropic, espelhamento/commit no pr-registry,
 * comentário no PR, comportamento sob rate limit autenticado.
 */
async function runSmoke({
  repoFull,
  perPage = 10,
  maxPaginas = 5,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
  conn = db.abrirBanco()
}) {
  if (fetchImpl === null || fetchImpl === undefined) {
    throw new Error('runSmoke: nenhum fetch disponível neste runtime.');
  }
  const [org, repo] = repoFull.split('/');

  let paginasPercorridas = 0;
  const clienteBase = createGithubClient({ token: undefined, fetchImpl });
  const githubClient = {
    ...clienteBase,
    listClosedPullRequestsPage: (o, r, opts) => {
      paginasPercorridas += 1;
      return clienteBase.listClosedPullRequestsPage(o, r, opts);
    }
  };

  const projetoId = db.cadastrarProjeto(conn, { org, repo });
  const projeto = db.buscarProjeto(conn, { org, repo });

  const resultado = await pollarProjeto({
    conn,
    projeto,
    githubClient,
    anthropicApiKey: undefined, // proposital: smoke sem credencial nenhuma
    perPage,
    maxPaginas
  });

  const registros = db.listarRegistros(conn, { projetoId });
  return {
    ...resultado,
    paginasPercorridas,
    registrosGravados: registros.length,
    todosDegradados: registros.every((r) => r.modo === 'degradado')
  };
}

module.exports = { runSmoke };

if (require.main === module) {
  const repoFull = process.argv[2];
  if (!repoFull) {
    console.error('Uso: node service/smoke-publico.js <org/repo-publico>');
    process.exit(1);
  }
  runSmoke({ repoFull })
    .then((resultado) => {
      console.log(JSON.stringify(resultado, null, 2));
    })
    .catch((err) => {
      console.error('Smoke falhou:', err.message);
      process.exit(1);
    });
}
