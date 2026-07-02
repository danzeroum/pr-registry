# Arquitetura — PR Registry

## Objetivo

Documentar automaticamente qualquer desenvolvimento (gerado por IA ou por
humanos) no momento do merge de cada Pull Request, produzindo registros
estruturados, rastreáveis até o requisito de origem, e visualizáveis num
dashboard.

## Princípios (não alterar sem decisão explícita)

1. **Fonte de verdade = diff mergeado.** O registro é gerado no evento de
   merge, a partir do diff final + commits + descrição do PR. O transcript
   do Claude Code, quando existir, é apenas contexto complementar para
   justificativas.
2. **Zero ação manual.** Captura via GitHub Action disparada no merge.
3. **Processamento headless.** O "tradutor" roda em CI — decidido na Fase 2:
   chamada direta à API Anthropic via `fetch` (não `claude -p`), para não
   depender de instalar o CLI do Claude Code em cada runner consumidor da
   Action. Nunca roda em sessão interativa.
4. **Rastreabilidade obrigatória PR → requisito**, com fallback explícito
   para `nao-vinculado` quando não há referência identificável.
5. **Registro híbrido:** JSON validado por schema (fonte de verdade para
   automação) + Markdown gerado a partir do JSON (leitura humana).
6. **O registro vive onde o trabalho acontece:** commitado no repositório
   central `pr-registry` e comentado no próprio PR.
7. **Idempotência:** chave `{repo}/{pr_number}` — reruns atualizam, nunca
   duplicam.
8. **Status por requisito é agregado**, não armazenado diretamente — calculado
   a partir dos PRs vinculados a cada requisito.

## Fluxo de ponta a ponta

```
PR mergeado (pull_request: closed, merged == true)
        │
        ▼
GitHub Action reutilizável (RF1)
  ├─ coleta diff final, arquivos, commits, título/descrição/labels,
  │  autor, branch, datas, transcript opcional (artefato)
  ├─ scrubbing de segredos (scripts/scrub.js) sobre tudo que será
  │  enviado ao LLM e sobre tudo que será commitado
  ▼
Chamada headless ao Claude (RF2)
  com prompts/categorizador.md como system prompt
        │
        ▼
Validação contra schema/registro.schema.json (RF4)
  ├─ válido → modo "completo"
  └─ inválido → retry com feedback do erro (máx. 2x)
       └─ ainda inválido → modo "degradado" (diff bruto) +
          issue de triagem no repositório central
        │
        ▼
Extração de rastreabilidade (RF5): título → branch → descrição →
  "nao-vinculado"
        │
        ▼
Geração do Markdown a partir do JSON (scripts/generate-md.js) (RF6)
        │
        ├─▶ Commit em registros/{ano}/{repo}/PR-{n}.json + .md
        │    (repositório central pr-registry, idempotente por chave
        │    {repo}/{pr_number})
        │
        └─▶ Comentário no PR mergeado, atualizado em re-runs (RF7)
        │
        ▼
Push em pr-registry dispara rebuild do dashboard estático (RF8)
  ├─ filtros por repo/PR/camada/tipo/status/período/requisito
  ├─ visão de detalhe do PR
  ├─ visão agregada por requisito (status calculado)
  ├─ heatmap de volume por camada
  └─ lista de pendências de rastreabilidade
```

## Componentes (fase em que são construídos)

| Componente | Fase | Descrição |
|---|---|---|
| `schema/registro.schema.json` | 1 | Fonte de verdade estrutural de um registro. |
| `prompts/categorizador.md` | 1 | System prompt versionado do "tradutor". |
| `scripts/scrub.js` | 1 | Scrubbing de segredos, reutilizado por Action e CI de segurança. |
| `scripts/generate-md.js` | 1 | JSON → Markdown, nunca editado à mão. |
| `scripts/validate.js` | 1 | Validação de schema + regras extras (snippet ≤ 10 linhas). |
| `registros/` | 1 (exemplos) / 2 (produção) | Repositório central de registros. |
| `action/` | 2 | GitHub Action reutilizável (captura → LLM → validação → commit → comentário). |
| `.github/workflows/capture.yml` | 2 | Workflow `workflow_call` que os repos de origem invocam no merge. |
| `docs/onboarding.md` | 2 | Passo a passo de instalação num novo repositório (RF11). |
| `dashboard/` | 3 | Site estático (Astro) publicado via GitHub Pages. |
| Hooks do Claude Code (opcional) | 4 | Enriquecimento do transcript como artefato de contexto. |

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
- **PRs de fork:** fora de escopo nesta fase (não têm acesso a secrets no
  evento `pull_request`). `action/index.js` detecta e pula esses PRs sem
  falhar o workflow. Ver `docs/onboarding.md` para a alternativa
  (`workflow_run`) caso uma organização precise cobrir forks.

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
