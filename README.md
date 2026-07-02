# pr-registry

Sistema automatizado de registro e documentação de desenvolvimento em Pull
Requests. Documenta, no momento do merge, o que foi feito, por quê, e em
qual camada (backend, frontend, banco de dados, API, infra, testes,
segurança, docs), gerando registros estruturados e rastreáveis até o
requisito de origem.

Veja a visão completa de arquitetura em [`docs/arquitetura.md`](docs/arquitetura.md).

> **Status:** Fases 1-3 concluídas. O produto pivotou na Fase 3 para uma
> **plataforma apartada multi-projeto** (polling em vez de Action instalada
> por repositório) — ver `docs/arquitetura.md#mudança-de-direção--fase-3-plataforma-apartada`.
> Nada das Fases 1-2 foi descartado: o motor foi extraído para `core/` e é
> compartilhado pelos dois adaptadores (`action/`, modo alternativo de
> implantação, e `service/`, o modo principal). 106 testes, todos com IO
> mockada — a validação com credenciais reais é um débito registrado e
> bloqueante em `docs/validacao-viva.md`. Dashboard (Fase 4) ainda não
> implementado.

## Estrutura

```
pr-registry/
├── core/                      # motor: scrubbing, categorização, validação, geração de MD
│   ├── requisito.js, diff.js, config.js, llm.js, categorize.js, degraded.js
│   ├── github-client.js       # cliente REST, token injetável (nenhum/PAT/App)
│   └── scrub.js, validate.js, generate-md.js
├── scripts/                    # CLIs finas sobre core/ (validate, generate-md, scrub)
├── schema/registro.schema.json # JSON Schema versionado (1.0 → 1.2)
├── prompts/categorizador.md    # system prompt do "tradutor"
├── action/                     # modo de implantação alternativo: Action por repositório (Fase 2)
├── .github/workflows/capture.yml
├── service/                    # modo principal: serviço de polling multi-projeto (Fase 3)
│   ├── db.js, poller.js, processar-pr.js, reprocessar-degradados.js
│   ├── github-token.js, smoke-publico.js
│   └── README.md
├── registros/{ano}/{repo}/PR-{numero}.json|.md  # espelho Git opcional
├── test/{,action/,core/,service/}*.test.js
└── docs/
    ├── arquitetura.md
    ├── onboarding.md           # como instalar o modo Action num repo
    └── validacao-viva.md       # checklist com credenciais reais (bloqueante)
```

## Uso

```bash
npm install

# validar um registro
npm run validate -- registros/2026/exemplo-repo/PR-101.json

# gerar/regenerar o Markdown a partir do JSON
npm run generate-md -- registros/2026/exemplo-repo/PR-101.json

# rodar o scrubber de segredos sobre um arquivo de texto
npm run scrub -- caminho/para/arquivo.txt

# rodar todos os testes (core + action + service)
npm test

# smoke test do serviço sem credenciais, contra um repo público
node service/smoke-publico.js <org>/<repo-publico>
```

## Regra de ouro

O arquivo `.md` de cada registro é **sempre gerado** a partir do `.json`
correspondente via `scripts/generate-md.js` — nunca editado manualmente.
