# Plano de rollout

Três etapas, cada uma com um portão de saída explícito — não avança para a
próxima sem cruzar o critério da anterior. O objetivo é não descobrir
problemas de qualidade ou custo depois de já ter 20 projetos e um backlog
inteiro processado.

## Etapa 1 — Validação viva no sandbox

**O que:** o checklist completo de `docs/validacao-viva.md` (12 passos),
contra um repositório sandbox real, com as três credenciais criadas:
GitHub App de leitura (`Contents`, `Pull requests`, `Metadata`), OAuth App
do dashboard, `ANTHROPIC_API_KEY`.

**Duração esperada:** meia tarde de trabalho — é a primeira vez que o
sistema toca GitHub/Anthropic/Docker de verdade, então espere fricção nos
9 itens documentados como débito (permissões do App, checkout raso,
payload real de diff, etc.). É para isso que ficaram documentados: para
não serem surpresa.

**Portão de saída:** os 12 passos do checklist marcados, sem nenhum
`[ ]` pendente. Se algo quebrar de um jeito não previsto no débito
documentado, é um bug real — corrigir antes de prosseguir, não contornar.

## Etapa 2 — Piloto com 2-3 projetos reais (1-2 semanas)

**O que:** cadastrar 2-3 projetos reais (não o sandbox) no dashboard, com
histórico normal de PRs — deixar o poller rodar no ritmo natural da
equipe, sem backfill agressivo. Os exemplos das Fases 1-3 foram escritos à
mão para testar o formato; PRs reais são mais bagunçados (diffs maiores,
descrições mais curtas, títulos sem padrão de requisito) — é isso que o
piloto testa.

**Critérios de saída (todos precisam ser atendidos):**

| Critério | Meta |
|---|---|
| Custo médio de tokens por PR | Medido e dentro do orçamento aceito pela organização (ajustar `diff.max_linhas` em `pr-registry.yml`/`config.js` se estourar) |
| Taxa de registros em `modo: degradado` | < 10% dos PRs do piloto (acima disso, investigar causa antes de escalar — geralmente é falha de categorização recorrente, não falta de API key) |
| Taxa de PRs sem requisito vinculado (`nao-vinculado`) | Medida e discutida com a equipe — alta taxa é sinal de que os padrões de `pr-registry.yml` precisam de ajuste, não necessariamente um problema do sistema |
| Feedback qualitativo de 1 gestor | Mostrar a visão `/gestor` com dados reais do piloto — "isso reflete o que sua equipe entregou?" |
| Feedback qualitativo de 1 analista de negócio | Mostrar a visão `/negocio` com dados reais — "você entende o que foi entregue, sem perguntar a um dev?" |

**Portão de saída:** os cinco critérios acima revisados numa conversa
curta com quem operou/observou o piloto. Ajustes de template ou de
`pr-registry.yml` encontrados aqui são baratos; encontrados depois de 20
projetos populados, custam reprocessamento.

## Etapa 3 — Expansão aos 20 projetos

**O que:** cadastrar os projetos restantes, com **backfill limitado**
(flag de limite baixo primeiro — ver `service/poller.js`/config de
backfill) para controlar o custo do histórico antes de processar tudo.
Aumentar o limite gradualmente, observando `execucoes_poller` e a taxa de
degradados a cada lote.

**Portão de saída:** não há — esta é a operação normal. Monitoramento
contínuo via `/gestor` (taxa de degradados, pendências) substitui o
checklist pontual das etapas anteriores.

## Quando voltar uma etapa

Se a Etapa 2 revelar um problema de qualidade sistemático (ex.: a
categorização erra a camada com frequência, ou a visão de negócio ainda
soa técnica em casos reais), o ajuste é em `prompts/categorizador.md` ou
nos templates de `dashboard/views/`, testado com a suíte existente, e o
piloto reinicia — não convém expandir para 20 projetos carregando um
problema conhecido.
