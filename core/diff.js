'use strict';

// Padrões padrão de arquivos gerados/lockfiles a excluir da análise (RNF7).
const DEFAULT_EXCLUDE = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.min\.js$/,
  /(^|\/)vendor\//
];

function toRegExp(pattern) {
  return pattern instanceof RegExp ? pattern : new RegExp(pattern);
}

function isExcluded(path, excludePatterns) {
  return excludePatterns.some((p) => toRegExp(p).test(path));
}

function countLines(patch) {
  if (!patch) return 0;
  return patch.split('\n').length;
}

/**
 * Trunca a lista de arquivos alterados por orçamento de linhas (proxy de
 * tokens), priorizando os hunks menores primeiro (mais focados, mais
 * prováveis de caber inteiros). Arquivos excluídos por padrão (lockfiles,
 * build output) nunca entram na análise e contam como omitidos.
 *
 * Retorna { arquivos, truncado } onde `truncado` é null quando nada foi
 * cortado, ou { arquivos_omitidos, linhas_omitidas } quando houve corte —
 * mesmo shape do campo opcional `diff_truncado` do schema (RNF7 / seção 5).
 */
function truncateDiff(files, { maxLines = 4000, excludePatterns = DEFAULT_EXCLUDE } = {}) {
  let arquivosOmitidos = 0;
  let linhasOmitidas = 0;

  const candidatos = [];
  for (const f of files) {
    if (isExcluded(f.path, excludePatterns)) {
      arquivosOmitidos += 1;
      linhasOmitidas += countLines(f.patch);
      continue;
    }
    candidatos.push(f);
  }

  const ordenados = [...candidatos].sort((a, b) => countLines(a.patch) - countLines(b.patch));

  const incluidosSet = new Set();
  let usedLines = 0;
  for (const f of ordenados) {
    const linhas = countLines(f.patch);
    if (usedLines + linhas > maxLines) {
      arquivosOmitidos += 1;
      linhasOmitidas += linhas;
      continue;
    }
    incluidosSet.add(f.path);
    usedLines += linhas;
  }

  // preserva a ordem original dos arquivos incluídos, não a ordem de empacotamento
  const arquivos = files.filter((f) => incluidosSet.has(f.path));

  const truncado = arquivosOmitidos > 0 ? { arquivos_omitidos: arquivosOmitidos, linhas_omitidas: linhasOmitidas } : null;

  return { arquivos, truncado };
}

module.exports = { truncateDiff, isExcluded, DEFAULT_EXCLUDE };
