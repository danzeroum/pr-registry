# dashboard/ — Fase 4

Servidor Fastify com server-side rendering simples (sem framework de
frontend, sem build step) — três visões por persona sobre o mesmo banco do
`service/`.

## Módulos

| Módulo | Responsabilidade |
|---|---|
| `server.js` | Rotas Fastify: consulta (autenticada), admin (autenticada + CSRF), OAuth. |
| `auth.js` | Fluxo OAuth do GitHub — checa filiação via `GET /user/memberships/orgs/{org}` com o token do próprio usuário (funciona com filiação privada). |
| `session.js` | Cookie de sessão assinado (HMAC), sem estado no servidor. |
| `dev-mode.js` | Resolve config a partir do ambiente; recusa subir sem OAuth fora do modo dev explícito; bind `127.0.0.1` por padrão em dev. |
| `csrf.js` | Double-submit cookie para as rotas de escrita da admin. |
| `views/dev.js`, `views/gestor.js`, `views/negocio.js` | As três visões por persona. |
| `views/negocio-lint.js` | Verificação estática que falha o build se `negocio.js` referenciar campos técnicos. |

## Como rodar localmente (sem OAuth)

```bash
DASHBOARD_DEV_MODE=true node dashboard/server.js
# abre em http://127.0.0.1:3000/dev (bind restrito, banner de aviso visível)
```

## Como rodar os testes

```bash
node --test test/dashboard/*.test.js
```

Os testes de `server.test.js` usam `fastify.inject()` — sem bind de porta
real, cobrindo o fluxo OAuth completo (login → callback → sessão → acesso),
CSRF nas duas rotas de escrita da admin, e a recusa de acesso sem sessão.

## O que ainda não foi validado com rede/credenciais reais

Ver `docs/validacao-viva.md`. Este dashboard nunca foi testado contra um
OAuth App real do GitHub nem contra a imagem Docker construída de verdade
(o daemon Docker não está disponível neste ambiente de desenvolvimento —
`Dockerfile`/`docker-compose.yml` foram revisados por leitura e o
`npm ci --omit=dev` foi validado, mas o build da imagem em si não rodou
aqui).
