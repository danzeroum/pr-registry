'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PATTERNS_PATH = path.join(__dirname, 'secret-patterns.json');
const REDACTED = '***REDACTED***';

function loadPatterns(patternsPath = DEFAULT_PATTERNS_PATH) {
  const raw = fs.readFileSync(patternsPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Aplica os padrões de segredo sobre um texto, substituindo cada ocorrência
 * por REDACTED. Retorna o texto limpo e a contagem de matches por padrão.
 */
function scrubText(text, patterns = loadPatterns()) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text, matches: {}, totalMatches: 0 };
  }

  let cleaned = text;
  const matches = {};
  let totalMatches = 0;

  for (const { nome, regex, flags } of patterns) {
    const re = new RegExp(regex, flags);
    const found = cleaned.match(re);
    if (found && found.length > 0) {
      matches[nome] = found.length;
      totalMatches += found.length;
      cleaned = cleaned.replace(re, REDACTED);
    }
  }

  return { text: cleaned, matches, totalMatches };
}

/**
 * Aplica scrubText recursivamente sobre todas as strings de um objeto/array,
 * preservando a estrutura. Útil para limpar um registro inteiro ou o payload
 * enviado ao LLM.
 */
function scrubObject(value, patterns = loadPatterns()) {
  const matches = {};
  let totalMatches = 0;

  function mergeMatches(m) {
    for (const [k, v] of Object.entries(m)) {
      matches[k] = (matches[k] || 0) + v;
      totalMatches += v;
    }
  }

  function walk(node) {
    if (typeof node === 'string') {
      const result = scrubText(node, patterns);
      mergeMatches(result.matches);
      return result.text;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  }

  const cleaned = walk(value);
  return { value: cleaned, matches, totalMatches };
}

module.exports = { scrubText, scrubObject, loadPatterns, REDACTED };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node scripts/scrub.js <arquivo.txt>');
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8');
  const { text: cleaned, matches, totalMatches } = scrubText(text);
  process.stdout.write(cleaned);
  if (totalMatches > 0) {
    console.error(`\n[scrub] ${totalMatches} segredo(s) redigido(s):`, matches);
  }
}
