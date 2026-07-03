'use strict';

/**
 * Constrói um registro em modo degradado (RF4/RNF6): usado quando a chave
 * da API está ausente, a chamada ao LLM falha, ou a saída do LLM não passa
 * na validação de schema após os retries de categorize.js. O pipeline não
 * bloqueia o merge — grava o que for possível automaticamente e sinaliza a
 * pendência para triagem manual. Reusado pela Action (Fase 2) e pelo
 * poller do serviço (Fase 3) — puramente funcional, sem I/O.
 */
function buildRegistroDegradado({
  prId,
  repo,
  tituloPr,
  autorDev,
  dataMerge,
  requisito,
  geradoPorIa,
  motivo,
  origem
}) {
  return {
    schema_version: '1.2',
    pr_id: prId,
    repo,
    titulo_pr: tituloPr,
    requisito,
    autor_dev: autorDev,
    gerado_por_ia: Boolean(geradoPorIa),
    data_merge: dataMerge,
    status_pr: 'mergeado',
    modo: 'degradado',
    acoes: [],
    resumo_geral: `Registro em modo degradado: ${motivo}`,
    resumo_gestor: 'Não foi possível gerar o resumo automático deste PR. Uma triagem manual foi solicitada.',
    pendencias: [`Modo degradado: ${motivo}`, 'Requer triagem manual — ver issue de triagem vinculada.'],
    tags: ['degradado'],
    ...(origem ? { origem } : {})
  };
}

function buildTriageIssueBody({ prId, repo, motivo, diffBrutoScrubado }) {
  const trecho = (diffBrutoScrubado || '').slice(0, 3000);
  const truncado = (diffBrutoScrubado || '').length > 3000;
  return [
    `O registro de **${prId}** (${repo}) foi gerado em modo degradado e precisa de triagem manual.`,
    '',
    `**Motivo:** ${motivo}`,
    '',
    '**Diff bruto (já passou por scrubbing de segredos, truncado para esta issue):**',
    '```diff',
    trecho,
    truncado ? '\n... (truncado)' : '',
    '```'
  ].join('\n');
}

function buildTriageIssueTitle({ prId, repo }) {
  return `[pr-registry] Triagem manual necessária: ${repo}/${prId}`;
}

module.exports = { buildRegistroDegradado, buildTriageIssueBody, buildTriageIssueTitle };
