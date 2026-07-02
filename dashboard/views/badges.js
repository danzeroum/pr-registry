'use strict';

const { escapeHtml } = require('./html');

function badgeModo(modo) {
  const classe = modo === 'degradado' ? 'badge-degradado' : 'badge-completo';
  return `<span class="badge ${classe}">${escapeHtml(modo)}</span>`;
}

function badgeOrigem(origem) {
  if (!origem) return '';
  const classe = origem === 'backfill' ? 'badge-backfill' : 'badge-evento';
  return `<span class="badge ${classe}">${escapeHtml(origem)}</span>`;
}

function avisoTruncamento(diffTruncado) {
  if (!diffTruncado) return '';
  return `<p>⚠️ Diff truncado: ${diffTruncado.arquivos_omitidos} arquivo(s), ${diffTruncado.linhas_omitidas} linha(s) omitidas.</p>`;
}

module.exports = { badgeModo, badgeOrigem, avisoTruncamento };
