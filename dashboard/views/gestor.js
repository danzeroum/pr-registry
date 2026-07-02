'use strict';

const { escapeHtml } = require('./html');
const { layout } = require('./layout');
const { badgeModo, badgeOrigem } = require('./badges');

const CAMADA_LABELS = {
  backend: 'Backend',
  frontend: 'Frontend',
  banco_de_dados: 'Banco de Dados',
  api: 'API',
  infra: 'Infraestrutura',
  testes: 'Testes',
  seguranca: 'Segurança',
  docs: 'Documentação',
  outros: 'Outros'
};

function heatmapPorCamada(registros) {
  const contagem = new Map();
  for (const linha of registros) {
    for (const acao of linha.json.acoes || []) {
      contagem.set(acao.camada, (contagem.get(acao.camada) || 0) + 1);
    }
  }
  return Object.keys(CAMADA_LABELS)
    .filter((c) => contagem.has(c))
    .map((c) => ({ camada: c, label: CAMADA_LABELS[c], total: contagem.get(c) }));
}

function statusPorProjeto(registros) {
  const porRepo = new Map();
  for (const linha of registros) {
    const repo = linha.json.repo;
    if (!porRepo.has(repo)) porRepo.set(repo, { repo, total: 0, completos: 0, degradados: 0 });
    const entrada = porRepo.get(repo);
    entrada.total += 1;
    if (linha.json.modo === 'completo') entrada.completos += 1;
    else entrada.degradados += 1;
  }
  return Array.from(porRepo.values());
}

function pendenciasAbertas(registros) {
  const abertas = [];
  for (const linha of registros) {
    for (const p of linha.json.pendencias || []) {
      abertas.push({ prId: linha.json.pr_id, repo: linha.json.repo, pendencia: p });
    }
  }
  return abertas;
}

function tendenciaMensal(registros) {
  const porMes = new Map();
  for (const linha of registros) {
    const dataMerge = linha.json.data_merge;
    if (!dataMerge) continue;
    const mes = dataMerge.slice(0, 7); // YYYY-MM
    porMes.set(mes, (porMes.get(mes) || 0) + 1);
  }
  return Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, total]) => ({ mes, total }));
}

function renderGestor(registros) {
  const heatmap = heatmapPorCamada(registros);
  const status = statusPorProjeto(registros);
  const pendencias = pendenciasAbertas(registros);
  const tendencia = tendenciaMensal(registros);

  const conteudo = `
    <section>
      <h2>Status por Projeto</h2>
      <table>
        <thead><tr><th>Projeto</th><th>Total</th><th>Completos</th><th>Degradados</th></tr></thead>
        <tbody>
          ${status
            .map(
              (s) =>
                `<tr><td>${escapeHtml(s.repo)}</td><td>${s.total}</td><td>${s.completos}</td><td>${s.degradados}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Heatmap de Volume por Camada</h2>
      <table>
        <thead><tr><th>Camada</th><th>Ações</th></tr></thead>
        <tbody>
          ${heatmap.map((h) => `<tr><td>${escapeHtml(h.label)}</td><td>${h.total}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Tendência (PRs mergeados por mês)</h2>
      <table>
        <thead><tr><th>Mês</th><th>PRs</th></tr></thead>
        <tbody>
          ${tendencia.map((t) => `<tr><td>${escapeHtml(t.mes)}</td><td>${t.total}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Pendências Abertas</h2>
      ${
        pendencias.length
          ? `<ul>${pendencias
              .map((p) => `<li>${escapeHtml(p.repo)}/${escapeHtml(p.prId)}: ${escapeHtml(p.pendencia)}</li>`)
              .join('')}</ul>`
          : '<p>Nenhuma pendência registrada.</p>'
      }
    </section>

    <section>
      <h2>Registros recentes</h2>
      ${registros
        .map(
          (linha) =>
            `<p>${escapeHtml(linha.json.repo)}/${escapeHtml(linha.json.pr_id)} — ${badgeModo(linha.json.modo)} ${badgeOrigem(linha.json.origem)}</p>`
        )
        .join('')}
    </section>
  `;

  return layout({ titulo: 'Gestor', conteudo });
}

module.exports = { renderGestor, heatmapPorCamada, statusPorProjeto, pendenciasAbertas, tendenciaMensal };
