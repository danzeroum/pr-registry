'use strict';

// Padrões padrão de extração de requisito (RF5 / princípio 4):
// #123 · PROJ-123 · req:<id>
const DEFAULT_PATTERNS = [/#(\d+)/, /\breq:([\w-]+)/i, /\b([A-Z][A-Z0-9]+-\d+)\b/];

function toRegExp(pattern) {
  return pattern instanceof RegExp ? pattern : new RegExp(pattern);
}

function extractFrom(text, patterns) {
  if (!text) return null;
  for (const pattern of patterns) {
    const re = toRegExp(pattern);
    const match = text.match(re);
    if (match) return match[1] || match[0];
  }
  return null;
}

/**
 * Extrai o requisito de origem seguindo a ordem de prioridade do princípio 4:
 * título do PR -> branch -> descrição -> não-vinculado.
 */
function extrairRequisito({ titulo, branch, descricao, patterns = DEFAULT_PATTERNS }) {
  const doTitulo = extractFrom(titulo, patterns);
  if (doTitulo) return { id: doTitulo, fonte: 'titulo_pr', titulo: '' };

  const doBranch = extractFrom(branch, patterns);
  if (doBranch) return { id: doBranch, fonte: 'branch', titulo: '' };

  const daDescricao = extractFrom(descricao, patterns);
  if (daDescricao) return { id: daDescricao, fonte: 'descricao_pr', titulo: '' };

  return { id: 'nao-vinculado', fonte: 'nao_vinculado', titulo: '' };
}

module.exports = { extrairRequisito, DEFAULT_PATTERNS };
