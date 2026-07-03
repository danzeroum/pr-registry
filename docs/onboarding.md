# Onboarding de um novo repositório (RNF5: ≤ 1 página)

## Pré-requisitos (uma vez por organização)

1. Crie um **GitHub App** dedicado ao `pr-registry` (não use PAT de conta
   pessoal — ver `docs/arquitetura.md`), com permissões:
   - No próprio `pr-registry`: `contents: write` (commitar registros),
     `issues: write` (abrir issues de triagem em modo degradado).
   - Em cada repositório de origem: `pull-requests: write` (comentar no PR).
2. Instale o App nos repositórios que vão usar a Action (o próprio
   `pr-registry` + cada repo de origem).
3. Guarde `PR_REGISTRY_APP_ID` e `PR_REGISTRY_APP_PRIVATE_KEY` como
   **secrets da organização** (não do repositório individual), disponíveis
   a todos os repos que instalarem a Action.
4. Guarde `ANTHROPIC_API_KEY` como secret de organização ou por repositório.
   Se ausente, o pipeline não quebra — gera o registro em `modo: degradado`
   (ver `docs/arquitetura.md#modo-degradado`).

## Por repositório (2 passos)

1. **(Opcional)** copie `pr-registry.example.yml` deste repositório para
   `pr-registry.yml` na raiz do seu repo e ajuste `projeto`, padrões extras
   de requisito e exclusões de diff.

2. Adicione um workflow que chama a Action reutilizável no evento de merge:

```yaml
# .github/workflows/pr-registry.yml no repositório de origem
name: PR Registry
on:
  pull_request:
    types: [closed]

jobs:
  registrar:
    if: github.event.pull_request.merged == true
    uses: <sua-org>/pr-registry/.github/workflows/capture.yml@main
    with:
      pr_registry_repo: <sua-org>/pr-registry
    secrets: inherit
```

Pronto — a partir do próximo PR mergeado, o registro aparece em
`pr-registry/registros/{ano}/{seu-repo}/PR-{numero}.json|.md` e como
comentário no PR, em até 3 minutos (RNF1).

## PRs de fork (limitação assumida)

Esta Action assume que os PRs vêm de **branches internas do mesmo
repositório**, não de forks públicos. O motivo: workflows disparados por
PRs de fork no evento `pull_request` não têm acesso aos secrets da
organização (App private key, API key) — é uma restrição de segurança do
próprio GitHub Actions, não desta Action.

- Se sua organização **não aceita PRs de fork** (caso comum em times
  internos usando Claude Code): nenhuma ação necessária, `action/index.js`
  detecta PRs de fork (`pull_request.head.repo.fork === true`) e os pula
  silenciosamente (sem falhar o workflow).
- Se sua organização **aceita contribuições via fork** e quer capturá-las:
  troque o gatilho para `workflow_run` (disparado após o workflow de CI do
  fork terminar, já no contexto do repositório base, com acesso a
  secrets), buscando os dados do PR mergeado via API do GitHub em vez do
  payload do evento. Isso não está implementado nesta fase — avalie o
  volume real de PRs de fork antes de priorizar.

## O que verificar após instalar

- [ ] Merge um PR de teste e confirme o registro em `registros/{ano}/{seu-repo}/`.
- [ ] Confirme o comentário no PR.
- [ ] Rode novamente o workflow (re-run) e confirme que o comentário foi
      **atualizado**, não duplicado.
- [ ] Remova temporariamente `ANTHROPIC_API_KEY` e confirme que o pipeline
      ainda gera um registro (em `modo: degradado`) e abre uma issue de
      triagem no `pr-registry`, sem quebrar o merge.
