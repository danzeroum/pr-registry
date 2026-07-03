'use strict';

const db = require('./db');
const { processarPr } = require('./processar-pr');

/**
 * Reprocessa registros em modo degradado quando a API key passa a existir
 * (RF4/débito das "credenciais adiadas" — ver docs/validacao-viva.md).
 * Rebusca o PR na API do GitHub (dados de um PR mergeado não expiram) e
 * roda a categorização de novo; se tiver sucesso, ATUALIZA o mesmo
 * registro (mesma linha, UNIQUE(repo, pr_id) preservado) em vez de criar
 * um segundo. Se falhar de novo, o registro continua degradado — não é
 * regressão, só não avançou.
 */
async function reprocessarDegradados({
  conn,
  githubClient,
  anthropicApiKey,
  categorizarImpl,
  projetoId,
  buscarProjetoPorId = (id) => db.listarProjetos(conn).find((p) => p.id === id)
}) {
  if (!anthropicApiKey) {
    throw new Error('reprocessarDegradados: ANTHROPIC_API_KEY é obrigatória — sem ela os registros continuariam degradados.');
  }

  const pendentes = db.listarRegistrosDegradados(conn, projetoId ? { projetoId } : undefined);
  const resultado = { reprocessados: 0, aindaDegradados: 0, erros: [] };

  for (const linha of pendentes) {
    const projeto = buscarProjetoPorId(linha.projeto_id);
    if (!projeto) {
      resultado.erros.push(`${linha.repo}/${linha.pr_id}: projeto ${linha.projeto_id} não encontrado`);
      continue;
    }

    const numero = Number(linha.pr_id.replace(/^PR-/, ''));
    try {
      // eslint-disable-next-line no-await-in-loop
      const pr = await githubClient.getPullRequest(projeto.org, projeto.repo, numero);
      const requisitoPatterns = projeto.padroesRequisito?.length
        ? projeto.padroesRequisito.map((p) => new RegExp(p))
        : undefined;

      // eslint-disable-next-line no-await-in-loop
      const { registro, modo } = await processarPr({
        pr,
        repoFull: `${projeto.org}/${projeto.repo}`,
        requisitoPatterns,
        githubClient,
        anthropicApiKey,
        categorizarImpl,
        origem: linha.origem
      });

      db.atualizarRegistro(conn, { repo: linha.repo, prId: linha.pr_id, registro });

      if (modo === 'completo') {
        resultado.reprocessados += 1;
      } else {
        resultado.aindaDegradados += 1;
      }
    } catch (e) {
      resultado.aindaDegradados += 1;
      resultado.erros.push(`${linha.repo}/${linha.pr_id}: ${e.message}`);
    }
  }

  return resultado;
}

module.exports = { reprocessarDegradados };
