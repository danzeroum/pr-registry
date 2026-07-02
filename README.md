# pr-registry

Sistema automatizado de registro e documentação de desenvolvimento em Pull
Requests. Documenta, no momento do merge, o que foi feito, por quê, e em
qual camada (backend, frontend, banco de dados, API, infra, testes,
segurança, docs), gerando registros estruturados e rastreáveis até o
requisito de origem.

Veja a visão completa de arquitetura em [`docs/arquitetura.md`](docs/arquitetura.md).

> **Status:** Fase 1 (Fundação) concluída — schema, template de Markdown,
> scripts utilitários e exemplos. GitHub Action, dashboard e hardening
> chegam nas fases seguintes.

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
├── test/                     # testes unitários (node --test)
└── docs/arquitetura.md
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
