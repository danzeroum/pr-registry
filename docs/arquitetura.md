# Arquitetura — PR Registry

## Objetivo

Documentar automaticamente qualquer desenvolvimento (gerado por IA ou por
humanos) no momento do merge de cada Pull Request, produzindo registros
estruturados, rastreáveis até o requisito de origem, e visualizáveis num
dashboard.

## Princípios (não alterar sem decisão explícita)

1. **Fonte de verdade = diff mergeado.** O registro é gerado a partir do
   diff final + commits + descrição do PR. O transcript do Claude Code,
   quando existir, é apenas contexto complementar para justificativas.
2. **Zero ação manual por repositório.** Cadastrar um projeto é o único
   passo — nenhuma Action, secret ou workflow precisa ser instalado no
   repositório de origem (decisão da Fase 3, ver abaixo).
3. **Processamento headless.** O "tradutor" roda fora de sessão interativa:
   chamada direta à API Anthropic via `fetch` (não `claude -p`).
4. **Rastreabilidade obrigatória PR → requisito**, com fallback explícito
   para `nao-vinculado` quando não há referência identificável.
5. **Registro híbrido:** JSON validado por schema (fonte de verdade para
   automação) + Markdown gerado a partir do JSON (leitura humana).
6. **Idempotência:** chave `{repo}/{pr_number}` (`UNIQUE(repo, pr_id)` no
   banco) — reprocessamento nunca duplica.
7. **Status por requisito é agregado**, não armazenado diretamente —
   calculado a partir dos PRs vinculados a cada requisito.
8. **Credencial sempre injetável.** Sem token, PAT ou GitHub App são o
   mesmo código com configuração diferente — nunca uma bifurcação de
   lógica (ver `core/github-client.js`, `service/github-token.js`).

## Mudança de direção — Fase 3: plataforma apartada

As Fases 1-2 entregaram uma GitHub Action instalada por repositório
(captura no evento de merge, push para o `pr-registry`). Na Fase 3 o
produto pivotou para um **serviço independente que centraliza N projetos
por polling**, em vez de uma Action instalada repo a repo. Motivo: em
escala (dezenas de repositórios), o atrito de instalar e manter Action +
secrets em cada um mataria a adoção; no modelo de polling, adicionar um
projeto é só um cadastro no serviço, sem tocar no repositório alvo — e
como efeito colateral, a limitação de PRs de fork da Fase 2 (secrets não
chegam a workflows disparados por fork) deixa de existir, porque o serviço
autentica uma única vez com a própria credencial, não depende do contexto
de execução do repositório de origem.

**Nada da Fase 1-2 foi descartado.** O motor (scrubbing → extração de
requisito → truncamento de diff → categorização com retry → validação →
geração de Markdown) foi extraído para `core/`, agnóstico de onde roda.
`action/` virou um adaptador fino sobre `core/` e continua funcionando como
modo de implantação alternativo para quem não quiser operar um serviço.
`service/` é o segundo adaptador, com sua própria lógica de coleta
(polling em vez de evento) e armazenamento (SQLite em vez de commit Git).

## Fluxo de ponta a ponta (Fase 3 — modelo de polling)

```
Agendador (a cada N minutos, por projeto cadastrado)
        │
        ▼
service/poller.js
  ├─ busca PRs fechados desde (cursor - sobreposição), paginado
  │  (core/github-client.js — token injetável: nenhum/PAT/App)
  ├─ filtra merged_at > janela; já existentes no banco (UNIQUE(repo,pr_id))
  │  são pulados sem re-chamar o LLM
  ▼
service/processar-pr.js (RF2-RF5, mesma lógica de core/ usada pela Action)
  ├─ extração de requisito, truncamento de diff, scrubbing
  ├─ categorização headless com retry de validação de schema (RF4)
  └─ sem API key ou após falha → registro em modo "degradado" (RF4/RNF6)
        │
        ▼
service/db.js — inserirRegistroEAvancarCursor (transação única)
  ├─ INSERT OR IGNORE do registro (idempotente por UNIQUE(repo, pr_id))
  └─ cursor avança para o MAIOR merged_at processado nesta rodada
     (nunca para "agora" — evita perder PRs mergeados durante o poll)
        │
        ├─▶ (opcional, por projeto) espelho Git + comentário no PR,
        │    reusando action/src/{commit,comment}.js
        │
        ▼
execucoes_poller registra prs_processados, erros, duracao_ms (evidência do RNF1)
        │
        ▼
Dashboard (Fase 4) consulta o banco — visões Desenvolvedor/Gestor/Analista de Negócio
```

## Componentes (fase em que são construídos)

| Componente | Fase | Descrição |
|---|---|---|
| `schema/registro.schema.json` | 1 | Fonte de verdade estrutural de um registro. |
| `prompts/categorizador.md` | 1 | System prompt versionado do "tradutor". |
| `core/scrub.js` | 1 (Fase 3: extraído para `core/`) | Scrubbing de segredos, reutilizado por Action, serviço e CI de segurança. |
| `core/generate-md.js` | 1 (idem) | JSON → Markdown, nunca editado à mão. |
| `core/validate.js` | 1 (idem) | Validação de schema + regras extras (snippet ≤ 10 linhas). |
| `core/requisito.js`, `core/diff.js`, `core/config.js`, `core/llm.js`, `core/categorize.js`, `core/degraded.js` | 2 (extraídos para `core/` na Fase 3) | Motor de captura, agnóstico de Action ou serviço. |
| `core/github-client.js` | 2 (promovido a `core/` na Fase 3) | Cliente REST mínimo, token injetável (nenhum/PAT/App) — usado por Action e poller. |
| `registros/` | 1 (exemplos) / 2 (produção via Action) | Espelho Git opcional dos registros (reusa `action/src/commit.js`). |
| `action/` | 2 | GitHub Action reutilizável — modo de implantação alternativo (captura → LLM → validação → commit → comentário). |
| `.github/workflows/capture.yml` | 2 | Workflow `workflow_call` que os repos de origem invocam no merge (só para quem usa o modo Action). |
| `service/db.js`, `poller.js`, `processar-pr.js`, `reprocessar-degradados.js`, `github-token.js`, `smoke-publico.js` | 3 | Serviço de polling multi-projeto — ver `service/README.md`. |
| `docs/onboarding.md` | 2 | Passo a passo de instalação no modo Action (RF11). |
| `docs/validacao-viva.md` | 3 | Checklist de validação com credenciais reais — débito registrado, bloqueante para produção. |
| `dashboard/` | 4 | Servidor Fastify + SSR: três visões por persona, admin de projetos, OAuth do GitHub. Ver `dashboard/README.md`. |
| `Dockerfile`, `docker-compose.yml` | 4 | Empacotamento de referência (dashboard + poller sobre o mesmo volume SQLite). |
| `docs/seguranca-servico.md` | 4 | Modelo de acesso (snippets visíveis a quem entra na org), rotina de backup do SQLite. |
| Hooks do Claude Code (opcional) | — | Enriquecimento do transcript como artefato de contexto (ainda não priorizado). |

## Decisões da Fase 2

- **Autenticação cross-repo:** GitHub App dedicado (não PAT pessoal),
  instalado no `pr-registry` e em cada repo de origem. `capture.yml` gera
  um token de curta duração por execução via `actions/create-github-app-token`.
  App ID e chave privada ficam como secrets de organização.
- **Idempotência do comentário:** marcador HTML invisível
  `<!-- pr-registry:{repo}/{pr_number} -->` no corpo do comentário
  (`action/src/comment.js`). A Action lista os comentários do PR, procura
  o marcador e faz `PATCH` se existir, `POST` caso contrário.
- **Corrida de commits no `pr-registry`:** com múltiplos repositórios
  mergeando em paralelo (RNF3), `action/src/commit.js` faz `add`+`commit`
  uma vez e, se o `push` for rejeitado por non-fast-forward, repete
  `fetch`+`rebase`+`push` com backoff exponencial (até 5 tentativas). Um
  conflito real de rebase (não apenas corrida) interrompe com erro em vez
  de tentar indefinidamente.
- **Conteúdo do PR é dado, não instrução:** diff, commits, título,
  descrição e transcript são de terceiros e podem conter tentativas de
  manipular o categorizador (prompt injection). `prompts/categorizador.md`
  instrui explicitamente a tratá-los como dados; o comentário postado no
  PR (`action/src/comment.js`) é sempre renderizado a partir do JSON já
  validado contra o schema — o texto livre do LLM nunca é postado
  diretamente.
- **Truncamento de diff como metadado, não pendência:** o corte por
  orçamento de tokens (RNF7) é registrado no campo opcional
  `diff_truncado` (`schema_version: "1.1"`), não em `pendencias` — é
  informação sobre a completude do pipeline, não uma ação pendente para
  humanos.
- **PRs de fork:** fora de escopo no modo Action (não têm acesso a secrets
  no evento `pull_request`). `action/index.js` detecta e pula esses PRs sem
  falhar o workflow. Essa limitação **não existe** no modo serviço (Fase
  3) — o poller autentica com a própria credencial, não depende do
  contexto de execução do repositório de origem.

## Decisões da Fase 3

- **Cursor por projeto, não relógio de parede.** `service/poller.js`
  avança o cursor para o **maior `merged_at` efetivamente processado**
  nesta rodada, nunca para o horário da execução. Avançar para "agora"
  perderia PRs mergeados durante o próprio poll (a listagem já foi buscada
  antes do merge acontecer). Cada poll também consulta com uma
  **sobreposição** para trás (alguns minutos antes do cursor) — PRs
  reapresentados nessa janela são idempotentes graças ao
  `UNIQUE(repo, pr_id)`, então a sobreposição é grátis em termos de
  correção, só custa uma consulta a mais. Ver `test/service/poller.test.js`
  para o cenário completo e seu contraponto (sem sobreposição, o PR se
  perde).
- **Paginação limitada por `updated_at`, não por `merged_at`.** A API do
  GitHub só ordena a listagem por `updated_at`. O poller para de paginar
  quando encontra um PR com `updated_at` anterior à janela — como
  `merged_at <= updated_at` sempre, isso é uma condição de parada segura
  (não existe PR mais além na página com `merged_at` dentro da janela que
  ainda não tenha sido visto).
- **Registro + cursor na mesma transação** (`inserirRegistroEAvancarCursor`
  em `service/db.js`): se o processo cair no meio, ou os dois gravam, ou
  nenhum grava — nunca um registro "órfão" sem cursor avançado.
- **Trava de execução em processo** (`service/poller.js`): impede que dois
  ciclos do mesmo projeto rodem sobrepostos (ex.: um ciclo lento ainda
  processando quando o próximo tick do agendador dispara). Suficiente para
  um processo único nesta escala — não é uma trava distribuída.
- **Reprocessamento de degradados** (`service/reprocessar-degradados.js`):
  como o serviço pode operar sem `ANTHROPIC_API_KEY` por um tempo
  (débito de "credenciais adiadas"), registros degradados precisam de um
  caminho de volta — rebusca o PR via API (dados de PR mergeado não
  expiram) e roda a categorização de novo, **atualizando** o mesmo
  registro (nunca criando um segundo).
- **Credencial sempre injetável** (`service/github-token.js`,
  `core/github-client.js`): nenhum token, PAT ou token de GitHub App usam
  exatamente o mesmo código — a troca é uma variável de ambiente, nunca uma
  bifurcação de lógica. Isso permitiu um smoke test real (sem esperar por
  App/PAT) contra a API pública não-autenticada do GitHub — ver
  `docs/validacao-viva.md`.
- **`origem: "evento" | "backfill"`** (`schema_version: "1.2"`, aditivo):
  distingue PRs capturados na janela normal do poller de PRs históricos
  processados no cadastro de um projeto novo — o dashboard (Fase 4) usa
  isso para não confundir "atividade recente" com "backlog importado".

## Modo degradado

Quando a saída do LLM falha validação de schema após os retries permitidos
(RF4/RNF6), o pipeline não bloqueia o merge: grava um registro com
`"modo": "degradado"`, preenchendo o que for possível automaticamente
(repo, pr_id, autor, datas, diff bruto scrubado) e abre uma issue de
triagem no repositório central para revisão manual. A taxa de registros em
modo degradado é uma métrica exibida no dashboard (RNF6).

## Segurança

Scrubbing de segredos ocorre em dois pontos: antes de qualquer conteúdo ser
enviado ao LLM, e antes de qualquer commit no repositório central (RF10).
A Fase 2 integra ferramentas consolidadas (gitleaks/trufflehog) como camada
adicional de defesa no CI do `pr-registry`, complementando (não
substituindo) `scripts/scrub.js`.

`scripts/secret-patterns.json` cobre tanto atribuições nomeadas
(`password=`, `apiKey:`) quanto prefixos de formato conhecido por vendor
(`sk-ant-`, `sk-proj-`, `sk_live_`/`pk_live_`, `AIza...`, `Bearer <token>`)
— segredos embutidos em snippets sem nome de variável óbvio só são detectados
pelos padrões de prefixo. Segredos sintéticos usados em testes devem ser
montados por concatenação em runtime (nunca como literal contíguo no
código-fonte), pois o push protection do próprio GitHub escaneia o texto
bruto do diff e bloqueia pushes com padrões de segredo reconhecíveis,
mesmo em fixtures de teste claramente falsas.

## Decisões da Fase 4

- **Stack: Fastify + SSR sem framework de frontend.** Um único processo
  Node, zero build step de frontend, mesmo runtime do resto do projeto —
  para um time pequeno operando isso, isso pesa mais que a sofisticação de
  uma SPA. `dashboard/views/*.js` são funções puras que retornam strings
  HTML (mesma filosofia de `core/generate-md.js`), testáveis sem subir um
  servidor.
- **Autenticação usa o token do próprio usuário, não o do App.** Membro da
  organização é verificado via `GET /user/memberships/orgs/{org}` com o
  access token OAuth do usuário logado — não `GET /orgs/{org}/members/{user}`,
  que só enxerga filiação pública e bloquearia a maioria dos membros reais
  (filiação privada é o padrão do GitHub). Resultado cacheado no cookie de
  sessão assinado, não re-consultado a cada página.
- **Nunca sobe sem OAuth por padrão.** `dashboard/dev-mode.js` recusa
  iniciar (`garantirArranqueSeguro`) se `GITHUB_OAUTH_CLIENT_ID/SECRET` e
  `SESSION_SECRET` não estiverem configurados, a menos que
  `DASHBOARD_DEV_MODE=true` seja setado explicitamente — e mesmo nesse
  caso o bind fica restrito a `127.0.0.1` por padrão. O débito de
  credenciais adiadas (mesmo princípio da Fase 3) nunca vira uma exposição
  silenciosa.
- **CSRF nas rotas de escrita da admin.** Cadastro de projeto e toggle de
  `comentar_pr` são as únicas rotas de escrita do dashboard — protegidas
  por double-submit cookie (`dashboard/csrf.js`) além da autenticação. As
  rotas de consulta (`/dev`, `/gestor`, `/negocio`, `/api/registros`,
  `/export.md`) são só leitura.
- **Persona Analista de Negócio com garantia mecânica.** A regra "só
  `descricao_gestor`/`resumo_gestor`, nunca campos técnicos" não fica só em
  comentário — `dashboard/views/negocio-lint.js` escaneia estaticamente
  `negocio.js` e `test/dashboard/negocio-lint.test.js` falha o build se
  alguém reintroduzir `.snippet`, `.camada`, `.tipo`, `.justificativa` etc.
  ali. A lista de PRs por requisito é detalhe expansível (`<details>`), não
  a porta de entrada — a porta de entrada é a história/requisito.
- **`origem: "evento"/"backfill"` e `diff_truncado` viram badges visuais**
  no dashboard (`dashboard/views/badges.js`), não texto solto — completude
  do registro é informação de primeira classe, não algo que o usuário
  precisa inferir.
