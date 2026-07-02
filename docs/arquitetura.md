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
3. **Processamento headless.** O "tradutor" roda em CI (`claude -p` ou
   chamada direta à API Anthropic), nunca em sessão interativa.
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
| `dashboard/` | 3 | Site estático (Astro) publicado via GitHub Pages. |
| Hooks do Claude Code (opcional) | 4 | Enriquecimento do transcript como artefato de contexto. |

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
