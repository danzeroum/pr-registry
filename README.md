# pr-registry

Sistema automatizado de registro e documentação de desenvolvimento em Pull
Requests. Documenta, no momento do merge, o que foi feito, por quê, e em
qual camada (backend, frontend, banco de dados, API, infra, testes,
segurança, docs), gerando registros estruturados e rastreáveis até o
requisito de origem.

Veja a visão completa de arquitetura em [`docs/arquitetura.md`](docs/arquitetura.md).

> **Status:** Fase 1 (Fundação) e Fase 2 (Pipeline) concluídas — schema,
> template de Markdown, scripts utilitários, Action reutilizável de
> captura no merge (com modo degradado e tolerância a jobs concorrentes)
> e exemplos. Dashboard e hardening final chegam nas fases seguintes. A
> Fase 2 foi verificada por testes de integração com IO mockada — rodar
> o checklist de `docs/onboarding.md` num repo sandbox real antes de
> produção.

## Estrutura

```
pr-registry/
├── registros/{ano}/{repo}/PR-{numero}.json|.md   # registros (JSON = fonte de verdade)
├── schema/registro.schema.json                    # JSON Schema versionado
├── prompts/categorizador.md                        # system prompt do "tradutor"
├── scripts/
│   ├── generate-md.js       # gera o .md a partir do .json
│   ├── validate.js          # valida um registro contra o schema
│   ├── scrub.js             # scrubbing de segredos
│   └── secret-patterns.json # padrões de segredo (configurável)
├── action/                   # Action reutilizável de captura (Fase 2) — ver action/README.md
├── .github/workflows/capture.yml  # workflow_call chamado pelos repos de origem
├── pr-registry.example.yml   # exemplo de config por repositório (RF11)
├── test/                     # testes unitários e de integração (node --test)
└── docs/
    ├── arquitetura.md
    └── onboarding.md          # como instalar a Action num novo repo
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

# rodar os testes
npm test
```

## Regra de ouro

O arquivo `.md` de cada registro é **sempre gerado** a partir do `.json`
correspondente via `scripts/generate-md.js` — nunca editado manualmente.
