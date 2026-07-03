'use strict';

// Entrypoint de produção do poller: roda em loop, um ciclo por projeto
// cadastrado, a cada POLL_INTERVAL_MS. Pensado para rodar como processo
// de longa duração (ver docker-compose.yml) — toda a lógica testável já
// está em poller.js; este arquivo é só o laço de agendamento.

const db = require('./db');
const { pollarProjeto } = require('./poller');
const { resolveGithubToken } = require('./github-token');
const { createGithubClient } = require('../core/github-client');

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10 * 60 * 1000);
const DB_PATH = process.env.DASHBOARD_DB_PATH || ':memory:';

async function cicloCompleto(conn, githubClient, anthropicApiKey) {
  const projetos = db.listarProjetos(conn);
  for (const projeto of projetos) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resultado = await pollarProjeto({ conn, projeto, githubClient, anthropicApiKey });
      if (resultado.skipped) {
        console.log(`[poller] ${projeto.org}/${projeto.repo}: ${resultado.skipped}`);
      } else {
        console.log(
          `[poller] ${projeto.org}/${projeto.repo}: ${resultado.prsProcessados} PR(s), ${resultado.duracaoMs}ms, ${resultado.erros.length} erro(s)`
        );
      }
    } catch (erro) {
      console.error(`[poller] ${projeto.org}/${projeto.repo}: falha no ciclo — ${erro.message}`);
    }
  }
}

function main() {
  const conn = db.abrirBanco(DB_PATH);
  const { token, modo } = resolveGithubToken();
  const githubClient = createGithubClient({ token });
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  console.log(`[poller] iniciando — credencial: ${modo}, intervalo: ${POLL_INTERVAL_MS}ms`);
  if (!anthropicApiKey) {
    console.warn('[poller] ANTHROPIC_API_KEY ausente — todos os registros serão gerados em modo degradado.');
  }

  const executar = () => cicloCompleto(conn, githubClient, anthropicApiKey).catch((e) => console.error('[poller] erro fatal no ciclo:', e));
  executar();
  setInterval(executar, POLL_INTERVAL_MS);
}

if (require.main === module) {
  main();
}

module.exports = { cicloCompleto };
