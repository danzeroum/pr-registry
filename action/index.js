'use strict';

const fs = require('fs');
const path = require('path');

const { extrairRequisito } = require('./src/requisito');
const { truncateDiff } = require('./src/diff');
const { loadConfig } = require('./src/config');
const { categorizar } = require('./src/categorize');
const { commitWithRetry } = require('./src/commit');
const { upsertComment } = require('./src/comment');
const { buildRegistroDegradado, buildTriageIssueBody, buildTriageIssueTitle } = require('./src/degraded');
const { createGithubClient } = require('./src/github');
const { generateMarkdown } = require('../scripts/generate-md');
const { scrubObject } = require('../scripts/scrub');

/**
 * Orquestra o pipeline completo de captura (RF1-RF7) para um único PR
 * mergeado. Todas as dependências de IO são injetáveis para permitir testes
 * de integração sem tocar em GitHub/Anthropic/git reais — ver
 * test/action/index.test.js para os critérios de aceite do E2E.
 *
 * LIMITAÇÃO ASSUMIDA (ver docs/onboarding.md): PRs vindos de fork não têm
 * acesso a secrets no evento `pull_request`, então são pulados sem erro —
 * a Action assume repos internos da organização, sem contribuições via
 * fork público.
 */
async function run({
  event,
  repoFull,
  prRegistryRepoFull,
  githubToken,
  anthropicApiKey,
  prRegistryDir,
  prRegistryBranch = 'main',
  sourceRepoDir = process.cwd(),
  transcript = null,
  githubClient = createGithubClient({ token: githubToken }),
  categorizarImpl = categorizar,
  commitWithRetryImpl = commitWithRetry,
  fsImpl = fs
}) {
  const pr = event.pull_request;
  if (!pr || pr.merged !== true) {
    return { skipped: 'not-a-merge-event' };
  }

  if (pr.head.repo && pr.head.repo.fork) {
    return {
      skipped: 'fork-pr-not-supported',
      detail:
        'PRs de fork não têm acesso aos secrets no evento pull_request; consulte docs/onboarding.md sobre a limitação de escopo assumida.'
    };
  }

  const [owner, repoName] = repoFull.split('/');
  const prNumber = pr.number;
  const prId = `PR-${prNumber}`;

  const config = loadConfig(sourceRepoDir);
  const requisitoPatterns = config.requisito.padroes.length
    ? config.requisito.padroes.map((p) => new RegExp(p))
    : undefined;

  const requisito = extrairRequisito({
    titulo: pr.title,
    branch: pr.head.ref,
    descricao: pr.body || '',
    ...(requisitoPatterns ? { patterns: requisitoPatterns } : {})
  });

  const [filesRaw, commitsRaw] = await Promise.all([
    githubClient.listPullRequestFiles(owner, repoName, prNumber),
    githubClient.listPullRequestCommits(owner, repoName, prNumber)
  ]);

  const files = filesRaw.map((f) => ({ path: f.filename, patch: f.patch || '' }));
  const { arquivos, truncado } = truncateDiff(files, {
    maxLines: config.diff.max_linhas,
    ...(config.diff.excluir.length ? { excludePatterns: config.diff.excluir.map((p) => new RegExp(p)) } : {})
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
    ...(truncado ? { diff_truncado_info: truncado } : {}),
    ...(transcript ? { transcript } : {})
  };

  const { value: payload } = scrubObject(payloadBruto);

  const geradoPorIa = Boolean(transcript);
  const anoMerge = (pr.merged_at || '').slice(0, 4) || String(new Date().getUTCFullYear());

  let registro = null;
  let modo = 'completo';
  let motivoDegradado = null;

  if (!anthropicApiKey) {
    motivoDegradado = 'ANTHROPIC_API_KEY ausente — LLM não pôde ser chamado';
  } else {
    try {
      const resultado = await categorizarImpl({ payload, apiKey: anthropicApiKey });
      registro = resultado.registro;
      if (truncado && !registro.diff_truncado) {
        registro.diff_truncado = truncado;
      }
    } catch (e) {
      motivoDegradado = e.message || 'falha desconhecida na categorização';
    }
  }

  if (!registro) {
    modo = 'degradado';
    registro = buildRegistroDegradado({
      prId,
      repo: repoName,
      tituloPr: pr.title,
      autorDev: pr.user.login,
      dataMerge: pr.merged_at,
      requisito,
      geradoPorIa,
      motivo: motivoDegradado
    });
  } else {
    registro.pr_id = prId;
    registro.repo = repoName;
  }

  const destDir = path.join(prRegistryDir, 'registros', anoMerge, repoName);
  fsImpl.mkdirSync(destDir, { recursive: true });
  const jsonPath = path.join(destDir, `${prId}.json`);
  const mdPath = path.join(destDir, `${prId}.md`);
  fsImpl.writeFileSync(jsonPath, `${JSON.stringify(registro, null, 2)}\n`, 'utf8');
  fsImpl.writeFileSync(mdPath, generateMarkdown(registro), 'utf8');

  const commitResult = await commitWithRetryImpl({
    cwd: prRegistryDir,
    branch: prRegistryBranch,
    filesToStage: [path.relative(prRegistryDir, jsonPath), path.relative(prRegistryDir, mdPath)],
    commitMessage: `registro: ${repoName}/${prId}`
  });

  const commentResult = await upsertComment({
    registro,
    repo: repoName,
    prNumber,
    listComments: () => githubClient.listIssueComments(owner, repoName, prNumber),
    createComment: (body) => githubClient.createIssueComment(owner, repoName, prNumber, body),
    updateComment: (id, body) => githubClient.updateIssueComment(owner, repoName, id, body)
  });

  let triageIssue = null;
  if (modo === 'degradado' && prRegistryRepoFull) {
    const [triageOwner, triageRepo] = prRegistryRepoFull.split('/');
    triageIssue = await githubClient.createIssue(
      triageOwner,
      triageRepo,
      buildTriageIssueTitle({ prId, repo: repoName }),
      buildTriageIssueBody({
        prId,
        repo: repoName,
        motivo: motivoDegradado,
        diffBrutoScrubado: JSON.stringify(payload.diff_arquivos, null, 2)
      }),
      ['pr-registry:triagem']
    );
  }

  return { registro, modo, commitResult, commentResult, triageIssue };
}

module.exports = { run };

if (require.main === module) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    console.error('GITHUB_EVENT_PATH não definido — este script deve rodar dentro de um job do GitHub Actions.');
    process.exit(1);
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));

  run({
    event,
    repoFull: process.env.GITHUB_REPOSITORY,
    prRegistryRepoFull: process.env.PR_REGISTRY_REPO,
    githubToken: process.env.PR_REGISTRY_TOKEN || process.env.GITHUB_TOKEN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    prRegistryDir: process.env.PR_REGISTRY_CHECKOUT_DIR,
    prRegistryBranch: process.env.PR_REGISTRY_BRANCH || 'main',
    transcript: process.env.PR_REGISTRY_TRANSCRIPT_PATH
      ? fs.readFileSync(process.env.PR_REGISTRY_TRANSCRIPT_PATH, 'utf8')
      : null
  })
    .then((resultado) => {
      console.log(JSON.stringify(resultado, null, 2));
      if (resultado.skipped) process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
