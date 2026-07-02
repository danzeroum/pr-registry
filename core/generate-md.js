'use strict';

const fs = require('fs');
const path = require('path');

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

const CAMADA_ORDEM = Object.keys(CAMADA_LABELS);

const TIPO_LABELS = {
  criacao: 'Criação',
  modificacao: 'Modificação',
  refatoracao: 'Refatoração',
  correcao: 'Correção',
  remocao: 'Remoção'
};

function yamlEscape(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (/[:#\-?[\]{}",\n]/.test(str) || str.trim() !== str) {
    return JSON.stringify(str);
  }
  return str;
}

function buildFrontmatter(registro) {
  const lines = [
    '---',
    `pr_id: ${yamlEscape(registro.pr_id)}`,
    `repo: ${yamlEscape(registro.repo)}`,
    `requisito_id: ${yamlEscape(registro.requisito.id)}`,
    `requisito_fonte: ${yamlEscape(registro.requisito.fonte)}`,
    `status_pr: ${yamlEscape(registro.status_pr)}`,
    `data_merge: ${yamlEscape(registro.data_merge)}`,
    `modo: ${yamlEscape(registro.modo)}`,
    `gerado_por_ia: ${registro.gerado_por_ia}`,
    '---'
  ];
  return lines.join('\n');
}

function buildAcaoBloco(acao) {
  const partes = [
    `#### ${acao.id} — ${TIPO_LABELS[acao.tipo] || acao.tipo}`,
    '',
    `**Descrição:** ${acao.descricao}`,
    '',
    `**Para gestores:** ${acao.descricao_gestor}`,
    '',
    `**Justificativa:** ${acao.justificativa}${acao.inferida ? ' _(inferida do diff)_' : ''}`
  ];

  if (Array.isArray(acao.arquivos_impactados) && acao.arquivos_impactados.length > 0) {
    partes.push('', '**Arquivos impactados:**');
    for (const f of acao.arquivos_impactados) partes.push(`- \`${f}\``);
  }

  if (acao.snippet) {
    partes.push('', '```', acao.snippet, '```');
  }

  if (Array.isArray(acao.dependencias) && acao.dependencias.length > 0) {
    partes.push('', `**Dependências:** ${acao.dependencias.join(', ')}`);
  }

  if (Array.isArray(acao.impacto) && acao.impacto.length > 0) {
    partes.push('', '**Impacto:**');
    for (const i of acao.impacto) partes.push(`- ${i}`);
  }

  return partes.join('\n');
}

function buildAcoesPorCamada(acoes) {
  const porCamada = new Map();
  for (const acao of acoes) {
    if (!porCamada.has(acao.camada)) porCamada.set(acao.camada, []);
    porCamada.get(acao.camada).push(acao);
  }

  const secoes = [];
  for (const camada of CAMADA_ORDEM) {
    const lista = porCamada.get(camada);
    if (!lista || lista.length === 0) continue;
    secoes.push(`### ${CAMADA_LABELS[camada]}`, '');
    for (const acao of lista) {
      secoes.push(buildAcaoBloco(acao), '');
    }
  }
  return secoes.join('\n').trimEnd();
}

function buildDiffTruncadoAviso(diffTruncado) {
  if (!diffTruncado) return '';
  return `> ⚠️ **Diff truncado para controlar custo:** ${diffTruncado.arquivos_omitidos} arquivo(s) e ${diffTruncado.linhas_omitidas} linha(s) omitidos da análise. Este registro pode não cobrir 100% do PR.\n`;
}

function buildStatusConsolidado(registro) {
  const contagem = new Map();
  for (const acao of registro.acoes) {
    contagem.set(acao.camada, (contagem.get(acao.camada) || 0) + 1);
  }

  const linhas = ['| Camada | Ações |', '|---|---|'];
  for (const camada of CAMADA_ORDEM) {
    const n = contagem.get(camada);
    if (!n) continue;
    linhas.push(`| ${CAMADA_LABELS[camada]} | ${n} |`);
  }
  linhas.push(`| **Total** | **${registro.acoes.length}** |`);

  const pendencias =
    Array.isArray(registro.pendencias) && registro.pendencias.length > 0
      ? ['', '**Pendências:**', ...registro.pendencias.map((p) => `- ${p}`)]
      : ['', '_Nenhuma pendência registrada._'];

  return [linhas.join('\n'), ...pendencias].join('\n');
}

/**
 * Gera o Markdown legível de um registro a partir do JSON — nunca editado à mão.
 */
function generateMarkdown(registro) {
  const aviso = buildDiffTruncadoAviso(registro.diff_truncado);
  const partes = [
    buildFrontmatter(registro),
    '',
    `# ${registro.titulo_pr}`,
    '',
    `_${registro.pr_id} · ${registro.repo} · requisito: ${registro.requisito.id}${
      registro.requisito.titulo ? ` (${registro.requisito.titulo})` : ''
    }_`,
    '',
    ...(aviso ? [aviso, ''] : []),
    '## Resumo Geral',
    '',
    registro.resumo_geral,
    '',
    '## Resumo para Gestores',
    '',
    registro.resumo_gestor,
    '',
    '## Ações',
    '',
    buildAcoesPorCamada(registro.acoes),
    '',
    '## Status Consolidado',
    '',
    buildStatusConsolidado(registro),
    ''
  ];

  return partes.join('\n');
}

module.exports = { generateMarkdown };
