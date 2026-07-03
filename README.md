# pr-registry

Sistema automatizado de registro e documentação de desenvolvimento em Pull
Requests. Documenta, no momento do merge, o que foi feito, por quê, e em
qual camada (backend, frontend, banco de dados, API, infra, testes,
segurança, docs), gerando registros estruturados e rastreáveis até o
requisito de origem.

Para uma explicação sem jargão técnico do que o sistema faz e por quê, veja
[`docs/resumo-executivo.md`](docs/resumo-executivo.md).

> **Status:** Fases 1-4 concluídas (construção). 162 testes, todos com IO
> mockada — o sistema ainda não processou nenhum PR real. O próximo passo é
> a validação com credenciais reais, descrita em
> [`docs/rollout.md`](docs/rollout.md). Nada das fases anteriores foi
> descartado: o motor está em `core/`, compartilhado por `action/` (modo
> alternativo de implantação por repositório) e `service/` + `dashboard/`
> (modo principal, plataforma multi-projeto — ver
> [`docs/arquitetura.md`](docs/arquitetura.md) para a mudança de direção da
> Fase 3).

## Quick start (modo dev, sem credenciais)

Sobe o dashboard localmente com dados de exemplo, sem precisar de GitHub
App, OAuth App nem `ANTHROPIC_API_KEY`. **Nunca use este modo em produção**
— ele existe só para explorar a interface.

**Opção A — Docker Compose:**
```bash
cp .env.example .env
echo "DASHBOARD_DEV_MODE=true" >> .env
docker compose up dashboard
# abre em http://127.0.0.1:3000/dev — porta publicada só em localhost
```

**Opção B — Node direto (sem Docker):**
```bash
npm install
DASHBOARD_DEV_MODE=true npm run dashboard
# abre em http://127.0.0.1:3000/dev — bind restrito a localhost por padrão
```

Em ambos os casos, um banner vermelho "MODO DEV — SEM AUTENTICAÇÃO" fica
visível em toda página — é proposital, não um bug.

## Cadastrar um projeto

Com o dashboard rodando (modo dev ou produção), acesse `/admin`:

1. Preencha `org`/`repo` do repositório GitHub a monitorar e clique em
   "Cadastrar".
2. O projeto aparece na lista com `cursor: nunca` — o poller ainda não
   rodou para ele. Em produção, o poller (`service/run-poller.js`, o
   segundo processo do `docker-compose.yml`) pega o projeto no próximo
   ciclo automaticamente.
3. Em modo dev (sem poller rodando), rode manualmente:
   `node service/smoke-publico.js <org>/<repo>` para um teste de leitura
   sem credenciais, ou monte um script curto chamando
   `service/poller.js#pollarProjeto` com uma `ANTHROPIC_API_KEY` — ver
   `service/README.md`.
4. Ative "Comentar no PR" no `/admin` se quiser que o serviço também
   comente o registro no próprio Pull Request (exige o GitHub App com
   permissão de escrita em Pull Requests nesse repositório).

## Mapa da documentação

| Documento | Quando ler |
|---|---|
| [`docs/resumo-executivo.md`](docs/resumo-executivo.md) | Explicar o sistema para alguém que não vai mexer no código (1 página, sem jargão). |
| [`docs/arquitetura.md`](docs/arquitetura.md) | Entender as decisões técnicas e por que o produto mudou de Action para plataforma na Fase 3. |
| [`docs/onboarding.md`](docs/onboarding.md) | Instalar o **modo Action** (alternativo) num repositório específico. |
| [`docs/seguranca-servico.md`](docs/seguranca-servico.md) | Modelo de acesso do dashboard, backup do banco, quem deveria ter acesso à organização OAuth. |
| [`docs/validacao-viva.md`](docs/validacao-viva.md) | Checklist bloqueante antes de ir para produção — o que só uma execução com credenciais reais prova. |
| [`docs/rollout.md`](docs/rollout.md) | Plano de adoção em 3 etapas: validação viva → piloto → expansão aos 20 projetos. |
| `service/README.md`, `dashboard/README.md`, `action/README.md` | Referência de cada módulo (rotas, funções, como testar). |

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
│   ├── github-token.js, smoke-publico.js, run-poller.js
│   └── README.md
├── dashboard/                  # Fase 4: dashboard com 3 visões por persona
│   ├── server.js, auth.js, session.js, csrf.js, dev-mode.js
│   ├── views/{dev,gestor,negocio,negocio-lint}.js
│   └── README.md
├── Dockerfile, docker-compose.yml, .env.example
├── registros/{ano}/{repo}/PR-{numero}.json|.md  # espelho Git opcional
├── test/{,action/,core/,service/,dashboard/}*.test.js
└── docs/
    ├── arquitetura.md
    ├── onboarding.md
    ├── seguranca-servico.md
    ├── validacao-viva.md
    ├── rollout.md
    └── resumo-executivo.md
```

## Uso (desenvolvimento)

```bash
npm install

# validar um registro
npm run validate -- registros/2026/exemplo-repo/PR-101.json

# gerar/regenerar o Markdown a partir do JSON
npm run generate-md -- registros/2026/exemplo-repo/PR-101.json

# rodar o scrubber de segredos sobre um arquivo de texto
npm run scrub -- caminho/para/arquivo.txt

# rodar todos os testes (core + action + service + dashboard)
npm test

# smoke test do serviço sem credenciais, contra um repo público
node service/smoke-publico.js <org>/<repo-publico>
```

## Regra de ouro

O arquivo `.md` de cada registro é **sempre gerado** a partir do `.json`
correspondente via `scripts/generate-md.js` — nunca editado manualmente.
