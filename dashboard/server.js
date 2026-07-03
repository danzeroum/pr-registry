'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const Fastify = require('fastify');
const fastifyCookie = require('@fastify/cookie');
const fastifyFormbody = require('@fastify/formbody');

const db = require('../service/db');
const { generateMarkdown } = require('../core/generate-md');
const { renderDev } = require('./views/dev');
const { renderGestor } = require('./views/gestor');
const { renderNegocio } = require('./views/negocio');
const { layout } = require('./views/layout');
const { escapeHtml } = require('./views/html');
const { codificarSessao, decodificarSessao } = require('./session');
const { gerarTokenCsrf, tokenCsrfValido } = require('./csrf');
const { buildAuthorizeUrl, exchangeCodeForAccessToken, verificarMembroDaOrg, buscarUsuarioAutenticado } = require('./auth');
const { resolverConfig, garantirArranqueSeguro } = require('./dev-mode');

const SESSAO_COOKIE = 'prr_session';
const OAUTH_STATE_COOKIE = 'prr_oauth_state';
const CSRF_COOKIE = 'prr_csrf';
const SESSAO_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function extrairFiltros(query) {
  const { projeto, camada, tipo, modo, origem, requisito, desde, ate } = query;
  return {
    projetoId: projeto ? Number(projeto) : undefined,
    camada: camada || undefined,
    tipo: tipo || undefined,
    modo: modo || undefined,
    origem: origem || undefined,
    requisitoId: requisito || undefined,
    desde: desde || undefined,
    ate: ate || undefined
  };
}

/**
 * Constrói a instância do Fastify sem chamar `.listen()` — a separação
 * entre "montar rotas" e "abrir a porta" é o que permite testar todas as
 * rotas com `fastify.inject()`, sem sockets reais nem servidor de verdade.
 */
function buildServer({ dbConn = db.abrirBanco(), config = resolverConfig(), fetchImpl = fetch } = {}) {
  const fastify = Fastify({ logger: false });
  fastify.register(fastifyCookie);
  fastify.register(fastifyFormbody);

  function lerSessao(request) {
    const cookie = request.cookies[SESSAO_COOKIE];
    return decodificarSessao(cookie, config.sessionSecret);
  }

  function autenticado(request) {
    if (config.devMode && !config.oauthConfigurado) {
      return { login: 'dev-local', membro: true, devMode: true };
    }
    const sessao = lerSessao(request);
    return sessao && sessao.membro ? sessao : null;
  }

  // Rotas de CONSULTA (leitura) — exigem autenticação, nunca escrevem.
  fastify.addHook('preHandler', (request, reply, done) => {
    const rotasPublicas = ['/login', '/auth/callback', '/health'];
    if (rotasPublicas.includes(request.url.split('?')[0])) {
      return done();
    }
    const usuario = autenticado(request);
    if (!usuario) {
      reply.redirect('/login');
      return;
    }
    request.usuario = usuario;
    done();
  });

  fastify.get('/health', async () => ({ ok: true }));

  fastify.get('/login', async (request, reply) => {
    if (config.devMode && !config.oauthConfigurado) {
      return reply.redirect('/dev');
    }
    const state = crypto.randomBytes(16).toString('base64url');
    reply.setCookie(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
    const url = buildAuthorizeUrl({
      clientId: config.oauthClientId,
      redirectUri: `${config.baseUrl}/auth/callback`,
      state
    });
    reply.redirect(url);
  });

  fastify.get('/auth/callback', async (request, reply) => {
    const { code, state } = request.query;
    const stateCookie = request.cookies[OAUTH_STATE_COOKIE];
    if (!state || !stateCookie || state !== stateCookie) {
      reply.code(400);
      return 'Estado OAuth inválido — tente entrar novamente.';
    }

    const accessToken = await exchangeCodeForAccessToken({
      clientId: config.oauthClientId,
      clientSecret: config.oauthClientSecret,
      code,
      redirectUri: `${config.baseUrl}/auth/callback`,
      fetchImpl
    });

    const usuario = await buscarUsuarioAutenticado({ userAccessToken: accessToken, fetchImpl });
    const membership = await verificarMembroDaOrg({
      userAccessToken: accessToken,
      org: config.org,
      login: usuario.login,
      fetchImpl
    });

    if (!membership.membro) {
      reply.code(403);
      return `Acesso negado: ${escapeHtml(usuario.login)} não é membro ativo de ${escapeHtml(config.org)}.`;
    }

    const cookie = codificarSessao(
      { login: usuario.login, membro: true, expiraEm: Date.now() + SESSAO_TTL_MS },
      config.sessionSecret
    );
    reply.setCookie(SESSAO_COOKIE, cookie, {
      httpOnly: true,
      secure: !config.devMode,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSAO_TTL_MS / 1000
    });
    reply.redirect('/dev');
  });

  fastify.get('/logout', async (request, reply) => {
    reply.clearCookie(SESSAO_COOKIE, { path: '/' });
    reply.redirect('/login');
  });

  fastify.get('/dev', async (request, reply) => {
    const registros = db.listarRegistrosFiltrados(dbConn, extrairFiltros(request.query));
    reply.type('text/html');
    return renderDevComBanner(registros, request.usuario?.devMode);
  });

  fastify.get('/gestor', async (request, reply) => {
    const registros = db.listarRegistrosFiltrados(dbConn, extrairFiltros(request.query));
    reply.type('text/html');
    return renderGestor(registros);
  });

  fastify.get('/negocio', async (request, reply) => {
    const agregado = db.agregarPorRequisito(dbConn, extrairFiltros(request.query));
    reply.type('text/html');
    return renderNegocio(agregado);
  });

  fastify.get('/export.md', async (request, reply) => {
    const registros = db.listarRegistrosFiltrados(dbConn, extrairFiltros(request.query));
    const markdown = registros.map((r) => generateMarkdown(r.json)).join('\n---\n\n');
    reply.type('text/markdown');
    reply.header('content-disposition', 'attachment; filename="pr-registry-export.md"');
    return markdown || '_Nenhum registro para os filtros aplicados._\n';
  });

  fastify.get('/api/registros', async (request, reply) => {
    const registros = db.listarRegistrosFiltrados(dbConn, extrairFiltros(request.query));
    return registros.map((r) => r.json);
  });

  // Rotas de ADMIN — leitura (formulário) e ESCRITA (cadastro/toggle),
  // sempre autenticadas; escrita sempre com verificação de CSRF.
  fastify.get('/admin', async (request, reply) => {
    let csrf = request.cookies[CSRF_COOKIE];
    if (!csrf) {
      csrf = gerarTokenCsrf();
      reply.setCookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'strict', path: '/admin' });
    }
    const projetos = db.listarProjetos(dbConn);
    reply.type('text/html');
    return renderAdmin(projetos, csrf);
  });

  fastify.post('/admin/projetos', async (request, reply) => {
    const tokenCookie = request.cookies[CSRF_COOKIE];
    if (!tokenCsrfValido(tokenCookie, request.body?.csrf)) {
      reply.code(403);
      return 'Token CSRF inválido.';
    }
    db.cadastrarProjeto(dbConn, {
      org: request.body.org,
      repo: request.body.repo,
      padroesRequisito: [],
      comentarPr: request.body.comentarPr === 'on'
    });
    reply.redirect('/admin');
  });

  fastify.post('/admin/projetos/:id/comentar-pr', async (request, reply) => {
    const tokenCookie = request.cookies[CSRF_COOKIE];
    if (!tokenCsrfValido(tokenCookie, request.body?.csrf)) {
      reply.code(403);
      return 'Token CSRF inválido.';
    }
    db.atualizarProjeto(dbConn, { id: Number(request.params.id), comentarPr: request.body.comentarPr === 'true' });
    reply.redirect('/admin');
  });

  return fastify;
}

function renderDevComBanner(registros, devMode) {
  const html = renderDev(registros);
  if (!devMode) return html;
  return html.replace(
    '<nav>',
    '<div style="background:#b91c1c;color:#fff;text-align:center;padding:8px;font-weight:bold;">⚠️ MODO DEV — SEM AUTENTICAÇÃO — USO LOCAL, NÃO EXPOR À REDE</div><nav>'
  );
}

function renderAdmin(projetos, csrfToken) {
  const linhas = projetos
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.org)}/${escapeHtml(p.repo)}</td>
        <td>${escapeHtml(p.cursorIso || 'nunca')}</td>
        <td>${p.comentarPr ? 'sim' : 'não'}</td>
        <td>
          <form method="post" action="/admin/projetos/${p.id}/comentar-pr" style="display:inline">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="comentarPr" value="${p.comentarPr ? 'false' : 'true'}">
            <button type="submit">${p.comentarPr ? 'Desativar comentário' : 'Ativar comentário'}</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  const conteudo = `
    <section>
      <h2>Projetos cadastrados</h2>
      <table>
        <thead><tr><th>Projeto</th><th>Cursor</th><th>Comenta no PR</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </section>
    <section>
      <h2>Cadastrar novo projeto</h2>
      <form method="post" action="/admin/projetos">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <label>Org: <input type="text" name="org" required></label>
        <label>Repo: <input type="text" name="repo" required></label>
        <label><input type="checkbox" name="comentarPr"> Comentar no PR</label>
        <button type="submit">Cadastrar</button>
      </form>
    </section>`;

  return layout({ titulo: 'Administração de Projetos', conteudo });
}

module.exports = { buildServer };

if (require.main === module) {
  const config = resolverConfig();
  try {
    garantirArranqueSeguro(config);
  } catch (erro) {
    console.error(erro.message);
    process.exit(1);
  }

  const dbConn = db.abrirBanco(config.dbPath);
  const fastify = buildServer({ dbConn, config });
  fastify.listen({ host: config.host, port: config.port }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`PR Registry dashboard em ${address} (devMode=${config.devMode}, oauthConfigurado=${config.oauthConfigurado})`);
  });
}
