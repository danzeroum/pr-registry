'use strict';

const { escapeHtml } = require('./html');
const { layout } = require('./layout');
const { badgeModo, badgeOrigem, avisoTruncamento } = require('./badges');

/**
 * Visão Desenvolvedor: detalhe técnico por PR e por camada — descrição,
 * justificativa, snippets, arquivos impactados. Linguagem técnica é
 * esperada aqui (ao contrário da visão de negócio).
 */
function renderAcao(acao) {
  return `
    <div class="acao">
      <strong>${escapeHtml(acao.camada)} · ${escapeHtml(acao.tipo)}</strong>
      <p>${escapeHtml(acao.descricao)}</p>
      <p><em>Justificativa: ${escapeHtml(acao.justificativa)}${acao.inferida ? ' (inferida)' : ''}</em></p>
      ${
        Array.isArray(acao.arquivos_impactados) && acao.arquivos_impactados.length
          ? `<p>Arquivos: ${acao.arquivos_impactados.map((f) => `<code>${escapeHtml(f)}</code>`).join(', ')}</p>`
          : ''
      }
      ${acao.snippet ? `<pre>${escapeHtml(acao.snippet)}</pre>` : ''}
    </div>`;
}

function renderRegistro(linha) {
  const r = linha.json;
  return `
    <section class="registro">
      <h2>${escapeHtml(r.pr_id)} — ${escapeHtml(r.titulo_pr)}</h2>
      <p>${escapeHtml(r.repo)} · ${badgeModo(r.modo)} ${badgeOrigem(r.origem)} · requisito: ${escapeHtml(r.requisito?.id || 'nao-vinculado')}</p>
      ${avisoTruncamento(r.diff_truncado)}
      <p>${escapeHtml(r.resumo_geral)}</p>
      ${(r.acoes || []).map(renderAcao).join('')}
    </section>`;
}

function renderDev(registros) {
  const conteudo = registros.length
    ? registros.map(renderRegistro).join('')
    : '<p>Nenhum registro encontrado para os filtros aplicados.</p>';
  return layout({ titulo: 'Desenvolvedor', conteudo });
}

module.exports = { renderDev };
