# action/ — Pipeline de captura (Fase 2 — modo de implantação alternativo)

Implementa RF1–RF7: coleta o PR mergeado, categoriza via Claude headless,
valida contra o schema com retry, commita no repositório central com
tolerância a corrida entre jobs concorrentes, e comenta no PR de forma
idempotente.

> Desde a Fase 3, o modo principal do produto é `service/` (polling
> multi-projeto, sem instalar nada no repositório de origem). Este diretório
> continua funcionando como modo alternativo — útil para quem prefere não
> operar um serviço próprio. O motor foi extraído para `core/`; este
> diretório é hoje um adaptador fino sobre ele.

## Estrutura

| Módulo | Responsabilidade |
|---|---|
| `../core/requisito.js` | Extração de rastreabilidade (título → branch → descrição → não-vinculado). |
| `../core/diff.js` | Truncamento do diff por orçamento de linhas, excluindo lockfiles/build output. |
| `../core/config.js` | Carrega `pr-registry.yml` do repo de origem (RF11). |
| `../core/llm.js` | Chamada headless à API Anthropic. |
| `../core/categorize.js` | Monta o prompt, chama o LLM, valida e faz retry com feedback (máx. 2 tentativas — RF4). |
| `../core/degraded.js` | Registro em modo degradado + issue de triagem quando a categorização não é possível. |
| `../core/github-client.js` | Cliente REST mínimo do GitHub (fetch e token injetáveis — nenhum/PAT/App). |
| `src/commit.js` | `git push` com fetch+rebase+retry e backoff para tolerar múltiplos jobs concorrentes escrevendo no `pr-registry`. Específico do modo Action (não usado pelo serviço). |
| `src/comment.js` | Comentário no PR renderizado exclusivamente do JSON validado, idempotente via marcador HTML. Reusado opcionalmente pelo serviço. |
| `index.js` | Orquestra o pipeline; entrypoint executado pelo workflow reutilizável. |

## Como rodar os testes

```bash
node --test test/action/*.test.js
```

## O que foi verificado nesta fase (e o que não foi)

Os 4 critérios de aceite definidos para o E2E foram verificados como
**testes de integração com dependências de IO mockadas** (GitHub API, git,
API Anthropic) — ver `test/action/index.test.js`:

1. registro válido gerado e commitado (schema-válido);
2. comentário criado no merge e atualizado, não duplicado, num re-run;
3. modo degradado acionado sem `ANTHROPIC_API_KEY` (e após falha de
   categorização), com issue de triagem aberta;
4. `index.js` repassa corretamente os argumentos de um cenário de push
   concorrente para `commit.js`, cuja lógica de fetch+rebase+retry tem
   cobertura própria em `test/action/commit.test.js`.

**O que isso NÃO cobre:** uma execução real do workflow `capture.yml` num
repositório GitHub de verdade, com App token real, chamada real à API
Anthropic e push real concorrente entre dois jobs do Actions. Isso requer
credenciais vivas (GitHub App instalado, `ANTHROPIC_API_KEY` real) que não
existem neste ambiente de desenvolvimento. Antes de considerar a Fase 2
pronta para produção, rode o checklist de `docs/onboarding.md#o-que-verificar-após-instalar`
num repositório sandbox real.
