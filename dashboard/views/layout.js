'use strict';

const { escapeHtml } = require('./html');

const ESTILO = `
  body { font-family: system-ui, sans-serif; margin: 0; color: #1a1a1a; background: #fafafa; }
  nav { background: #1a1a2e; padding: 12px 24px; }
  nav a { color: #e0e0f0; margin-right: 20px; text-decoration: none; font-size: 14px; }
  nav a:hover { text-decoration: underline; }
  main { padding: 24px; max-width: 960px; margin: 0 auto; }
  .banner-dev { background: #b91c1c; color: white; text-align: center; padding: 8px; font-weight: bold; }
  section.registro, section.requisito { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .acao { border-left: 3px solid #6366f1; padding-left: 12px; margin: 12px 0; }
  pre { background: #f3f3f3; padding: 8px; overflow-x: auto; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
  .badge-completo { background: #dcfce7; color: #166534; }
  .badge-degradado { background: #fee2e2; color: #991b1b; }
  .badge-evento { background: #e0e7ff; color: #3730a3; }
  .badge-backfill { background: #fef3c7; color: #92400e; }
`;

function layout({ titulo, conteudo, devModeSemAuth = false }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titulo)} · PR Registry</title>
  <style>${ESTILO}</style>
</head>
<body>
${devModeSemAuth ? '<div class="banner-dev">⚠️ MODO DEV — SEM AUTENTICAÇÃO — USO LOCAL, NÃO EXPOR À REDE</div>' : ''}
<nav>
  <a href="/dev">Desenvolvedor</a>
  <a href="/gestor">Gestor</a>
  <a href="/negocio">Analista de Negócio</a>
  <a href="/admin">Admin</a>
</nav>
<main>
<h1>${escapeHtml(titulo)}</h1>
${conteudo}
</main>
</body>
</html>`;
}

module.exports = { layout };
