# service/ — Plataforma multi-projeto (Fase 3)

Serviço de polling que centraliza a documentação de N projetos GitHub, sem
precisar instalar nada no repositório de origem — cadastro é feito aqui.

## Requisitos

- Node.js ≥ 22.5 (usa `node:sqlite`, experimental — sem dependência nativa
  como `better-sqlite3`, evita problemas de compilação). Um
  `ExperimentalWarning` no stderr é esperado e inofensivo.

## Módulos

| Módulo | Responsabilidade |
|---|---|
| `db.js` | Schema SQLite (`projetos`, `registros`, `execucoes_poller`) e toda a camada de acesso a dados — isolada para trocar por Postgres sem tocar no poller. |
| `processar-pr.js` | Monta o registro de um PR (requisito, diff, scrubbing, categorização/degradado) — compartilhado entre poller e reprocessamento. |
| `poller.js` | Ciclo de polling por projeto: cursor com sobreposição, trava de execução, `duracao_ms`. |
| `reprocessar-degradados.js` | Recategoriza registros `modo: degradado` quando a API key passa a existir. |
| `github-token.js` | Resolve a credencial (App/PAT/nenhuma) de forma injetável. |
| `smoke-publico.js` | Smoke test sem credenciais contra repositório público — ver `docs/validacao-viva.md`. |

## Como rodar os testes

```bash
node --test test/service/*.test.js
```

## O que ainda falta para produção

Ver `docs/validacao-viva.md` — este serviço nunca rodou contra GitHub/Anthropic
reais neste ambiente de desenvolvimento (sem credenciais configuradas). O
checklist de validação viva é bloqueante antes de cadastrar qualquer
projeto real.

## Relação com `action/`

A Action (Fase 2) continua funcionando e é mantida como modo de implantação
alternativo — útil para quem prefere não operar um serviço próprio. Ambas
compartilham o mesmo motor em `core/`; nenhuma lógica foi duplicada.
