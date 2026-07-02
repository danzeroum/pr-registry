# Segurança do serviço

## O que este serviço guarda

O `pr-registry` armazena, para cada PR mergeado de cada projeto cadastrado:
título, descrição, autor, e **trechos de código (snippets)** extraídos do
diff. Isso significa que **acesso ao dashboard equivale, na prática, a
acesso de leitura a trechos do código-fonte** dos projetos monitorados —
mesmo que o dashboard nunca exponha o repositório Git em si.

Isso é relevante para quem decide quem entra na organização GitHub usada
para autenticação (`GITHUB_ORG`): qualquer membro ativo dessa organização
ganha acesso às visões **Desenvolvedor** e **Gestor**, que mostram
snippets. A visão **Analista de Negócio** não mostra snippets nem outros
campos técnicos (garantido mecanicamente por
`test/dashboard/negocio-lint.test.js`), mas isso não reduz o que as outras
duas visões expõem.

Recomendação: a organização GitHub usada para `GITHUB_ORG` deve ser a
mesma (ou um subconjunto) de quem já tem acesso de leitura aos
repositórios monitorados — o dashboard não deve conceder acesso a código
que a pessoa não teria de outra forma.

## Modelo de autenticação

- OAuth App do GitHub, escopo `read:org` apenas (não pede acesso a
  repositórios — o serviço lê PRs com sua própria credencial, não com a do
  usuário logado).
- Filiação verificada via `GET /user/memberships/orgs/{org}` com o token
  do próprio usuário — funciona com filiação privada (ver
  `dashboard/auth.js`); convite pendente (`state: pending`) não concede
  acesso.
- Sessão em cookie assinado HMAC-SHA256 (`dashboard/session.js`),
  `httpOnly`, `secure` fora do modo dev, TTL de 8h. Sem estado de sessão
  no servidor — revogar acesso de alguém remove a pessoa da organização
  GitHub (a próxima verificação de filiação nega o acesso).
- Rotas de escrita (`/admin/projetos*`) protegidas por CSRF (double-submit
  cookie) além da autenticação — ver `dashboard/csrf.js`.
- **Nunca sobe sem OAuth configurado fora do modo dev explícito**
  (`DASHBOARD_DEV_MODE=true`) — ver `dashboard/dev-mode.js` e o teste
  `test/dashboard/dev-mode.test.js`. Em modo dev, o bind é restrito a
  `127.0.0.1` por padrão.

## Credenciais do poller

O poller lê PRs com sua própria credencial (nenhuma / PAT / GitHub App —
ver `docs/validacao-viva.md`), nunca com a do usuário logado no dashboard.
Permissões mínimas do GitHub App: `Contents: read`, `Pull requests: read`,
`Metadata: read`; `Issues: write` e `Pull requests: write` somente nos
projetos com `comentar_pr: true`.

## Backup do volume SQLite

O banco (`DASHBOARD_DB_PATH`, por padrão `/data/pr-registry.sqlite` no
Docker) é a única cópia dos registros de todos os projetos cadastrados —
diferente do modo Action (Fase 2), que também espelha em Git. **Perder
este arquivo apaga a memória institucional acumulada**, não só um cache.

Rotina mínima recomendada:

1. Backup diário do arquivo `pr-registry.sqlite` (SQLite é um único
   arquivo — `cp` ou `sqlite3 .backup` funcionam; prefira `.backup` com o
   serviço rodando, para evitar capturar o arquivo no meio de uma escrita).
   ```bash
   sqlite3 /data/pr-registry.sqlite ".backup /backup/pr-registry-$(date +%F).sqlite"
   ```
2. Retenção de pelo menos 30 dias, em armazenamento fora do host do
   container (o volume nomeado do Docker sobrevive a `docker compose
   down`, mas não a perda do disco/host).
3. Teste de restauração periódico — um backup nunca testado não é um
   backup confiável.
4. Se a escala crescer a ponto de justificar Postgres (ver
   `service/db.js` — a camada de acesso a dados foi isolada exatamente
   para essa migração), backups ficam a cargo da infraestrutura de
   Postgres escolhida, não deste documento.
