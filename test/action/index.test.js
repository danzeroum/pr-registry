'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../action/index');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const REGISTRO_VALIDO = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'registros', '2026', 'exemplo-repo', 'PR-101.json'), 'utf8')
);

function baseEvent(overrides = {}) {
  return {
    pull_request: {
      number: 101,
      title: 'Implementa login social com Google (PROJ-88)',
      body: 'Descrição do PR.',
      merged: true,
      merged_at: '2026-07-02T10:00:00Z',
      head: { ref: 'feature/proj-88-google-login', repo: { fork: false } },
      user: { login: 'dev.exemplo' },
      labels: [],
      ...overrides
    }
  };
}

function makeFakeGithubClient({ existingComments = [] } = {}) {
  const criadosComentarios = [];
  const atualizadosComentarios = [];
  const issuesCriadas = [];
  let comentariosAtuais = [...existingComments];

  return {
    client: {
      listPullRequestFiles: async () => [{ filename: 'src/routes/auth.ts', patch: '+linha 1\n+linha 2' }],
      listPullRequestCommits: async () => [{ commit: { message: 'feat: adiciona endpoint /auth/google' } }],
      listIssueComments: async () => comentariosAtuais,
      createIssueComment: async (owner, repo, prNumber, body) => {
        const novo = { id: `comment-${criadosComentarios.length + 1}`, body };
        criadosComentarios.push(novo);
        comentariosAtuais = [...comentariosAtuais, novo];
        return novo;
      },
      updateIssueComment: async (owner, repo, commentId, body) => {
        atualizadosComentarios.push({ commentId, body });
        comentariosAtuais = comentariosAtuais.map((c) => (c.id === commentId ? { ...c, body } : c));
        return null;
      },
      createIssue: async (owner, repo, title, body, labels) => {
        const issue = { id: `issue-${issuesCriadas.length + 1}`, title, body, labels };
        issuesCriadas.push(issue);
        return issue;
      }
    },
    criadosComentarios,
    atualizadosComentarios,
    issuesCriadas,
    getComentariosAtuais: () => comentariosAtuais
  };
}

async function fakeCommitWithRetry() {
  return { attempts: 1 };
}

test('critério de aceite 1: registro válido é gerado e commitado (modo completo)', async () => {
  const prRegistryDir = makeTempDir('pr-registry-e2e-');
  const sourceRepoDir = makeTempDir('source-repo-e2e-');
  const { client } = makeFakeGithubClient();

  const resultado = await run({
    event: baseEvent(),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: 'fake-anthropic-key',
    prRegistryDir,
    prRegistryBranch: 'main',
    sourceRepoDir,
    githubClient: client,
    categorizarImpl: async () => ({ registro: JSON.parse(JSON.stringify(REGISTRO_VALIDO)), tentativas: 1 }),
    commitWithRetryImpl: fakeCommitWithRetry
  });

  assert.equal(resultado.modo, 'completo');
  assert.equal(resultado.registro.pr_id, 'PR-101');
  assert.equal(resultado.registro.repo, 'exemplo-repo');

  const jsonPath = path.join(prRegistryDir, 'registros', '2026', 'exemplo-repo', 'PR-101.json');
  const mdPath = path.join(prRegistryDir, 'registros', '2026', 'exemplo-repo', 'PR-101.md');
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(mdPath));

  const gravado = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const { validateRegistro } = require('../../scripts/validate');
  const { valid, errors } = validateRegistro(gravado);
  assert.equal(valid, true, errors.join('\n'));
});

test('critério de aceite 2: comentário é criado no merge e atualizado (não duplicado) num re-run', async () => {
  const prRegistryDir = makeTempDir('pr-registry-e2e-');
  const sourceRepoDir = makeTempDir('source-repo-e2e-');
  const { client, criadosComentarios, atualizadosComentarios, getComentariosAtuais } = makeFakeGithubClient();

  const runArgs = {
    event: baseEvent(),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: 'fake-anthropic-key',
    prRegistryDir,
    sourceRepoDir,
    githubClient: client,
    categorizarImpl: async () => ({ registro: JSON.parse(JSON.stringify(REGISTRO_VALIDO)), tentativas: 1 }),
    commitWithRetryImpl: fakeCommitWithRetry
  };

  const primeiraExecucao = await run(runArgs);
  assert.equal(primeiraExecucao.commentResult.action, 'created');
  assert.equal(criadosComentarios.length, 1);

  // simula re-run (rerun do workflow / reabertura) com o comentário já existente
  const segundaExecucao = await run({ ...runArgs, githubClient: { ...client, listIssueComments: async () => getComentariosAtuais() } });
  assert.equal(segundaExecucao.commentResult.action, 'updated');
  assert.equal(criadosComentarios.length, 1, 'não deve criar um segundo comentário');
  assert.equal(atualizadosComentarios.length, 1);
});

test('critério de aceite 3: sem ANTHROPIC_API_KEY, cai em modo degradado e abre issue de triagem', async () => {
  const prRegistryDir = makeTempDir('pr-registry-e2e-');
  const sourceRepoDir = makeTempDir('source-repo-e2e-');
  const { client, issuesCriadas } = makeFakeGithubClient();

  const resultado = await run({
    event: baseEvent(),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: undefined,
    prRegistryDir,
    sourceRepoDir,
    githubClient: client,
    commitWithRetryImpl: fakeCommitWithRetry
  });

  assert.equal(resultado.modo, 'degradado');
  assert.equal(resultado.registro.modo, 'degradado');
  assert.equal(issuesCriadas.length, 1);
  assert.match(issuesCriadas[0].title, /exemplo-repo\/PR-101/);

  const { validateRegistro } = require('../../scripts/validate');
  const { valid, errors } = validateRegistro(resultado.registro);
  assert.equal(valid, true, errors.join('\n'));
});

test('critério de aceite 3b: falha de categorização (após retries) também cai em modo degradado', async () => {
  const prRegistryDir = makeTempDir('pr-registry-e2e-');
  const sourceRepoDir = makeTempDir('source-repo-e2e-');
  const { client, issuesCriadas } = makeFakeGithubClient();

  const resultado = await run({
    event: baseEvent(),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: 'fake-anthropic-key',
    prRegistryDir,
    sourceRepoDir,
    githubClient: client,
    categorizarImpl: async () => {
      throw new Error('Categorização falhou após retries de validação de schema');
    },
    commitWithRetryImpl: fakeCommitWithRetry
  });

  assert.equal(resultado.modo, 'degradado');
  assert.equal(issuesCriadas.length, 1);
});

test('critério de aceite 4: push concorrente é resolvido via retry (delegado a commitWithRetry, aqui verificamos a integração)', async () => {
  const prRegistryDir = makeTempDir('pr-registry-e2e-');
  const sourceRepoDir = makeTempDir('source-repo-e2e-');
  const { client } = makeFakeGithubClient();

  let chamadas = 0;
  const commitWithRetryImpl = async (args) => {
    chamadas += 1;
    // simula exatamente o cenário de corrida: primeira tentativa falha por
    // non-fast-forward, a própria função resolve internamente (testado a
    // fundo em test/action/commit.test.js) e aqui só garantimos que
    // index.js repassa os argumentos certos e aguarda a resolução.
    assert.equal(args.branch, 'main');
    assert.ok(args.filesToStage.length === 2);
    return { attempts: 2 };
  };

  const resultado = await run({
    event: baseEvent(),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: 'fake-anthropic-key',
    prRegistryDir,
    prRegistryBranch: 'main',
    sourceRepoDir,
    githubClient: client,
    categorizarImpl: async () => ({ registro: JSON.parse(JSON.stringify(REGISTRO_VALIDO)), tentativas: 1 }),
    commitWithRetryImpl
  });

  assert.equal(chamadas, 1);
  assert.equal(resultado.commitResult.attempts, 2);
});

test('PRs de fork são pulados sem erro (limitação assumida — ver docs/onboarding.md)', async () => {
  const prRegistryDir = makeTempDir('pr-registry-e2e-');
  const sourceRepoDir = makeTempDir('source-repo-e2e-');
  const { client } = makeFakeGithubClient();

  const resultado = await run({
    event: baseEvent({ head: { ref: 'feature/x', repo: { fork: true } } }),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: 'fake-anthropic-key',
    prRegistryDir,
    sourceRepoDir,
    githubClient: client
  });

  assert.equal(resultado.skipped, 'fork-pr-not-supported');
});

test('eventos que não são merge são ignorados (ex.: PR fechado sem merge)', async () => {
  const resultado = await run({
    event: baseEvent({ merged: false }),
    repoFull: 'org/exemplo-repo',
    prRegistryRepoFull: 'org/pr-registry',
    githubToken: 'fake-gh-token',
    anthropicApiKey: 'fake-anthropic-key',
    prRegistryDir: '/nao-deveria-ser-usado',
    githubClient: {}
  });
  assert.equal(resultado.skipped, 'not-a-merge-event');
});
