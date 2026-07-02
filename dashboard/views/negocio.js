'use strict';

// VISÃO DO ANALISTA DE NEGÓCIO — navegação por requisito, sem jargão
// técnico. Regra dura (garantida por test/dashboard/negocio-lint.test.js,
// que falha o build se este arquivo referenciar campos técnicos): o texto
// narrativo vem EXCLUSIVAMENTE de `descricao_gestor` e `resumo_gestor`.
// Nunca acesse `.descricao` (sem sufixo), `.resumo_geral`, `.snippet`,
// `.justificativa`, `.camada`, `.tipo` ou `.arquivos_impactados` neste
// arquivo — a lista de PRs é detalhe expansível, não a porta de entrada.

const { escapeHtml } = require('./html');
const { layout } = require('./layout');

function renderPrResumo(linha) {
  const r = linha.json;
  return `
    <li>
      <strong>${escapeHtml(r.titulo_pr)}</strong> (${escapeHtml(r.data_merge ? r.data_merge.slice(0, 10) : '')})
      <p>${escapeHtml(r.resumo_gestor)}</p>
    </li>`;
}

function contarEntregas(total) {
  return total === 1 ? '1 entrega registrada' : `${total} entregas registradas`;
}

function renderRequisito(grupo) {
  const tituloRequisito = grupo.naoVinculado
    ? 'Trabalho sem história/requisito vinculado'
    : grupo.titulo || grupo.requisitoId;

  const statusTexto = grupo.prsDegradados > 0 ? 'Parte do trabalho ainda aguarda revisão' : 'Entregue';

  return `
    <section class="requisito">
      <h2>${escapeHtml(tituloRequisito)}</h2>
      <p>${contarEntregas(grupo.totalPrs)} · ${escapeHtml(statusTexto)}</p>
      <details>
        <summary>Ver o que foi entregue</summary>
        <ul>${grupo.prs.map(renderPrResumo).join('')}</ul>
      </details>
    </section>`;
}

function renderNegocio(agregadoPorRequisito) {
  const conteudo = agregadoPorRequisito.length
    ? agregadoPorRequisito.map(renderRequisito).join('')
    : '<p>Nenhum requisito com entregas registradas ainda.</p>';
  return layout({ titulo: 'Analista de Negócio', conteudo });
}

module.exports = { renderNegocio };
