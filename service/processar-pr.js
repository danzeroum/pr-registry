'use strict';

const { extrairRequisito } = require('../core/requisito');
const { truncateDiff } = require('../core/diff');
const { categorizar } = require('../core/categorize');
const { scrubObject } = require('../core/scrub');
const { buildRegistroDegradado } = require('../core/degraded');

/**
 * Monta o registro de um PR (RF2-RF5) a partir de dados já buscados da API
 * do GitHub — usado tanto pelo poller (PR recém-descoberto) quanto pelo
 * reprocessamento de registros degradados (mesmo PR, categorização refeita
 * quando a API key passa a existir). Não faz I/O de git nem comentário —
 * isso é responsabilidade de quem chama, exatamente como em action/index.js.
 */
async function processarPr({
  pr,
  repoFull,
  requisitoPatterns,
  diffMaxLinhas,
  diffExcludePatterns,
  githubClient,
  anthropicApiKey,
  categorizarImpl = categorizar,
  origem = 'evento'
}) {
  const [owner, repoName] = repoFull.split('/');
  const prId = `PR-${pr.number}`;

  const requisito = extrairRequisito({
    titulo: pr.title,
    branch: pr.head.ref,
    descricao: pr.body || '',
    ...(requisitoPatterns ? { patterns: requisitoPatterns } : {})
  });

  const [filesRaw, commitsRaw] = await Promise.all([
    githubClient.listPullRequestFiles(owner, repoName, pr.number),
    githubClient.listPullRequestCommits(owner, repoName, pr.number)
  ]);

  const files = filesRaw.map((f) => ({ path: f.filename, patch: f.patch || '' }));
  const { arquivos, truncado } = truncateDiff(files, {
    maxLines: diffMaxLinhas,
    ...(diffExcludePatterns && diffExcludePatterns.length ? { excludePatterns: diffExcludePatterns } : {})
  });

  const commits = commitsRaw.map((c) => c.commit.message);

  const payloadBruto = {
    titulo: pr.title,
    descricao: pr.body || '',
    branch: pr.head.ref,
    autor: pr.user.login,
    labels: (pr.labels || []).map((l) => l.name),
    data_merge: pr.merged_at,
    commits,
    diff_arquivos: arquivos,
    ...(truncado ? { diff_truncado_info: truncado } : {})
  };

  const { value: payload } = scrubObject(payloadBruto);

  let registro = null;
  let motivoDegradado = null;

  if (!anthropicApiKey) {
    motivoDegradado = 'ANTHROPIC_API_KEY ausente — LLM não pôde ser chamado';
  } else {
    try {
      const resultado = await categorizarImpl({ payload, apiKey: anthropicApiKey });
      registro = resultado.registro;
      if (truncado && !registro.diff_truncado) registro.diff_truncado = truncado;
    } catch (e) {
      motivoDegradado = e.message || 'falha desconhecida na categorização';
    }
  }

  if (!registro) {
    registro = buildRegistroDegradado({
      prId,
      repo: repoName,
      tituloPr: pr.title,
      autorDev: pr.user.login,
      dataMerge: pr.merged_at,
      requisito,
      geradoPorIa: false,
      motivo: motivoDegradado,
      origem
    });
  } else {
    registro.pr_id = prId;
    registro.repo = repoName;
    registro.origem = origem;
  }

  return { registro, modo: registro.modo, motivoDegradado };
}

module.exports = { processarPr };
