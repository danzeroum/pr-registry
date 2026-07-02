'use strict';

const db = require('./db');
const { processarPr } = require('./processar-pr');

const OVERLAP_MINUTOS_DEFAULT = 5;
const MAX_PAGINAS_DEFAULT = 20;
const PER_PAGE_DEFAULT = 30;

// Trava em processo: impede que dois ciclos do poller rodem sobrepostos
// para o mesmo projeto (ex.: um ciclo demorado ainda rodando quando o
// próximo tick do agendador dispara). Suficiente nesta escala (processo
// único) — não é uma trava distribuída.
const locksEmAndamento = new Set();

function epoch0Iso() {
  return new Date(0).toISOString();
}

function subtrairMinutos(iso, minutos) {
  return new Date(new Date(iso).getTime() - minutos * 60000).toISOString();
}

function maxIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Executa um ciclo de poll para um projeto: busca PRs mergeados desde o
 * cursor (com sobreposição para trás, ver docs/arquitetura.md), processa
 * os que ainda não existem no banco e persiste registro+cursor numa
 * transação por PR. O cursor avança para o maior merged_at efetivamente
 * visto nesta rodada — nunca para o horário da execução — para não perder
 * PRs mergeados durante o próprio poll (ver test/service/poller.test.js,
 * cenário "PR mergeado durante o poll não é perdido").
 */
async function pollarProjeto({
  conn,
  projeto,
  githubClient,
  anthropicApiKey,
  categorizarImpl,
  overlapMinutos = OVERLAP_MINUTOS_DEFAULT,
  maxPaginas = MAX_PAGINAS_DEFAULT,
  perPage = PER_PAGE_DEFAULT,
  clock = () => Date.now()
}) {
  if (locksEmAndamento.has(projeto.id)) {
    return { skipped: 'poll-ja-em-andamento' };
  }
  locksEmAndamento.add(projeto.id);

  const inicioMs = clock();
  const erros = [];
  let prsProcessados = 0;

  try {
    const cursorAtual = projeto.cursorIso || epoch0Iso();
    const janelaInicioIso = projeto.cursorIso ? subtrairMinutos(cursorAtual, overlapMinutos) : epoch0Iso();
    const janelaInicioMs = new Date(janelaInicioIso).getTime();

    const candidatos = [];
    let pagina = 1;
    let paginasEsgotadas = false;

    while (pagina <= maxPaginas && !paginasEsgotadas) {
      // eslint-disable-next-line no-await-in-loop
      const prs = await githubClient.listClosedPullRequestsPage(projeto.org, projeto.repo, {
        perPage,
        page: pagina
      });
      if (!prs || prs.length === 0) break;

      for (const pr of prs) {
        const updatedAtMs = pr.updated_at ? new Date(pr.updated_at).getTime() : null;
        if (updatedAtMs !== null && updatedAtMs < janelaInicioMs) {
          // Lista ordenada por updated_at desc: a partir daqui tudo é mais
          // antigo que a janela — pode parar de paginar com segurança.
          paginasEsgotadas = true;
          break;
        }
        if (!pr.merged_at) continue; // fechado sem merge
        const mergedAtMs = new Date(pr.merged_at).getTime();
        if (mergedAtMs <= janelaInicioMs) continue; // fora da janela, mas segue paginando
        candidatos.push(pr);
      }

      pagina += 1;
    }
    if (pagina > maxPaginas && !paginasEsgotadas) {
      erros.push(`limite de ${maxPaginas} páginas atingido — pode haver PRs mais antigos não revisados nesta rodada`);
    }

    candidatos.sort((a, b) => new Date(a.merged_at).getTime() - new Date(b.merged_at).getTime());

    let maiorMergedAtVisto = projeto.cursorIso || null;
    const requisitoPatterns = projeto.padroesRequisito?.length
      ? projeto.padroesRequisito.map((p) => new RegExp(p))
      : undefined;

    for (const pr of candidatos) {
      const prId = `PR-${pr.number}`;
      maiorMergedAtVisto = maxIso(maiorMergedAtVisto, pr.merged_at);

      if (db.registroExiste(conn, { repo: projeto.repo, prId })) {
        continue; // já processado — a sobreposição do cursor pode reapresentá-lo, é inofensivo
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const { registro } = await processarPr({
          pr,
          repoFull: `${projeto.org}/${projeto.repo}`,
          requisitoPatterns,
          githubClient,
          anthropicApiKey,
          categorizarImpl,
          origem: 'evento'
        });

        db.inserirRegistroEAvancarCursor(conn, {
          projetoId: projeto.id,
          repo: projeto.repo,
          prId,
          registro,
          novoCursorIso: null // cursor avança uma vez só, ao final da rodada
        });
        prsProcessados += 1;
      } catch (e) {
        erros.push(`${prId}: ${e.message}`);
      }
    }

    if (maiorMergedAtVisto && new Date(maiorMergedAtVisto).getTime() > new Date(cursorAtual).getTime()) {
      db.avancarCursor(conn, { projetoId: projeto.id, cursorIso: maiorMergedAtVisto });
    }

    const duracaoMs = clock() - inicioMs;
    db.registrarExecucao(conn, { projetoId: projeto.id, prsProcessados, erros, duracaoMs });

    return { prsProcessados, erros, duracaoMs, novoCursorIso: maiorMergedAtVisto || cursorAtual };
  } finally {
    locksEmAndamento.delete(projeto.id);
  }
}

module.exports = { pollarProjeto, OVERLAP_MINUTOS_DEFAULT, subtrairMinutos, maxIso };
