# Validação viva (débito registrado — bloqueante para rollout em produção)

## Por que este documento existe

As Fases 3 (serviço de polling) e 4 (dashboard) foram implementadas e
testadas **inteiramente com IO mockada** (GitHub API, Anthropic API,
OAuth do GitHub, relógio) porque não havia GitHub App, PAT nem OAuth App
configurados no momento da implementação, e o daemon Docker não está
disponível neste ambiente de desenvolvimento. Isso é uma decisão
explícita, não um esquecimento — mas significa que riscos reais nunca
foram exercitados: permissões insuficientes do token, comportamento sob
rate limit autenticado, e se a imagem Docker de fato builda e sobe. Este
documento é o checklist que fecha essa lacuna antes de cadastrar qualquer
projeto real no serviço.

## O que a suíte de testes já prova (sem credenciais)

- Motor de categorização, scrubbing, validação de schema, geração de MD —
  106 testes, `core/` e `action/` (Fases 1-2) inalterados.
- Semântica do cursor com sobreposição: `test/service/poller.test.js` prova
  que um PR mergeado durante a janela do poll anterior não se perde, e
  prova o oposto (perda) quando a sobreposição é desligada — não é só
  "parece certo", é uma regressão que o teste pega se alguém remover o
  overlap no futuro.
- Transação registro+cursor, idempotência via `UNIQUE(repo, pr_id)`,
  reprocessamento de degradados sem duplicar — `test/service/db.test.js` e
  `test/service/reprocessar-degradados.test.js`.
- Trava de execução impedindo polls sobrepostos do mesmo projeto.
- Paginação de `service/smoke-publico.js` testada com `fetch` mockado em 2+
  páginas (`test/service/smoke-publico.test.js`) — prova a lógica, não a
  API real.
- Dashboard (Fase 4): fluxo OAuth completo (login → callback → sessão →
  acesso), verificação de membro via `GET /user/memberships/orgs/{org}`
  (inclusive o caso de filiação privada), CSRF nas rotas de escrita,
  recusa de subir sem OAuth fora do modo dev — tudo via `fastify.inject()`
  com `fetch` mockado (`test/dashboard/server.test.js`). A visão de
  negócio nunca expõe campos técnicos, garantido estaticamente
  (`test/dashboard/negocio-lint.test.js`).

## O que só a validação com credenciais prova

| # | O que verificar | Por quê o mock não basta |
|---|---|---|
| 1 | O token do App/PAT tem permissão suficiente e nada além disso | Mocks nunca recusam por permissão — só uma chamada real revela um 403 de escopo insuficiente ou um App com permissão de mais |
| 2 | Rebase real não falha por checkout raso | `git rebase` sobre um clone shallow falha de um jeito específico que só aparece com git de verdade (`.github/workflows/capture.yml` já usa `fetch-depth: 0` — confirmar que resolve) |
| 3 | Rate limit autenticado (5000 req/h) sob volume real | O código trata 403/429 (`core/github-client.js`), mas o comportamento do GitHub sob throttling real (headers de reset, jitter) não é simulável com fidelidade |
| 4 | Tamanho real do payload do diff em PRs grandes | Truncamento é testado com fixtures pequenas; PRs reais de 500+ linhas exercitam o `max_linhas` de verdade |
| 5 | Categorização real via Anthropic | Todo teste usa `categorizarImpl` mockado — nunca validamos a saída real do modelo contra o schema em um caso não-preparado |
| 6 | Cronometragem merge→registro visível (RNF1: ≤ 3 min, ou ≤ intervalo do poller) | `duracao_ms` é registrado, mas só um ciclo real (rede + LLM) dá o número que importa |
| 7 | Espelhamento no `pr-registry` e comentário no PR | `action/src/commit.js`/`comment.js` têm cobertura própria (Fase 2), mas nunca foram chamados a partir do poller de verdade |
| 8 | OAuth App real do GitHub (client id/secret, callback URL) | Testes usam `fetchImpl` mockado ponta a ponta — nunca houve um App registrado de verdade, um redirect real do navegador, nem um `code` de autorização genuíno |
| 9 | A imagem Docker builda e sobe (`docker build` + `docker compose up`) | O daemon Docker não está disponível neste ambiente (`docker build` falhou por falta do socket) — `Dockerfile`/`docker-compose.yml` foram revisados por leitura e `npm ci --omit=dev` foi validado isoladamente, mas a imagem em si nunca rodou |

## Registro do que já foi tentado neste ambiente

Rede real para `api.github.com` está bloqueada nesta sessão de
desenvolvimento (proxy da sessão), independentemente de autenticação:

```
$ node service/smoke-publico.js octocat/Hello-World
Smoke falhou: GitHub API GET .../pulls?... respondeu 403:
"API rate limit exceeded for <ip>. (...) Authenticated requests get a
higher rate limit."
```

Isto é uma limitação do ambiente de desenvolvimento, não um defeito do
código — a chamada é montada corretamente (mesmo formato que os testes
mockados validam), só não conseguiu completar por causa do proxy/IP
compartilhado desta sessão. Rode `service/smoke-publico.js` numa máquina
com rede normal para obter o resultado real.

## Checklist de execução (quando a credencial existir)

- [ ] **Criar o GitHub App** com permissões mínimas de leitura:
      `Contents: read`, `Pull requests: read`, `Metadata: read`. Adicionar
      `Issues: write` e `Pull requests: write` **somente** nos projetos com
      `comentar_pr: true`.
- [ ] Instalar o App (ou gerar um PAT fine-grained com os mesmos escopos)
      num repositório sandbox real.
- [ ] `PR_REGISTRY_APP_TOKEN` (ou `PR_REGISTRY_PAT`) + `ANTHROPIC_API_KEY`
      no ambiente do serviço.
- [ ] `node service/smoke-publico.js <org>/<repo-sandbox>` — confirmar
      paginação real (se o repo tiver mais PRs fechados que `perPage=10`) e
      registros gravados (em modo degradado, pois o smoke não usa
      `ANTHROPIC_API_KEY` de propósito).
- [ ] Rodar o poller completo (com `ANTHROPIC_API_KEY`) contra o mesmo
      sandbox — confirmar registro em `modo: completo`, schema-válido.
- [ ] Mergear um PR novo no sandbox e confirmar ingestão no próximo ciclo
      do poller — cronometrar merge→registro visível (item 6 da tabela).
- [ ] Mergear dois PRs quase simultaneamente — confirmar que ambos são
      capturados (nenhum perdido pela corrida) e checar `execucoes_poller`
      para ver se algum poll foi pulado pela trava (`skipped:
      'poll-ja-em-andamento'`) sem perder dados no ciclo seguinte.
- [ ] Rodar `reprocessarDegradados` sobre os registros do smoke
      (que ficaram degradados de propósito) e confirmar atualização para
      `modo: completo`.
- [ ] Cadastrar um projeto com histórico (backfill) e confirmar que
      `origem: "backfill"` aparece nos registros antigos vs. `"evento"` nos
      novos.
- [ ] Criar um OAuth App do GitHub real (callback = `{DASHBOARD_BASE_URL}/auth/callback`),
      configurar `GITHUB_OAUTH_CLIENT_ID/SECRET`, `SESSION_SECRET`,
      `GITHUB_ORG` e confirmar o login real: redirect → autorização no
      GitHub → callback → sessão → acesso a `/dev`.
- [ ] Repetir o login com uma conta cuja filiação na organização é
      **privada** — é o cenário que motivou trocar de
      `GET /orgs/{org}/members/{user}` para
      `GET /user/memberships/orgs/{org}` (ver `docs/arquitetura.md`).
- [ ] `docker build .` e `docker compose up` — confirmar que a imagem
      builda, o dashboard sobe em `DASHBOARD_HOST=0.0.0.0`, e o poller
      (`service/run-poller.js`) roda no container separado sobre o mesmo
      volume.
- [ ] Testar a rotina de backup do SQLite (`docs/seguranca-servico.md`)
      com o container rodando, e uma restauração de fato.
