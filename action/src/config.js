'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_FILENAME = 'pr-registry.yml';

const DEFAULTS = {
  projeto: null,
  requisito: { padroes: [] },
  diff: { max_linhas: 4000, excluir: [] }
};

/**
 * Carrega a configuração mínima por repositório (RF11). Se o arquivo não
 * existir, retorna os defaults — a Action funciona sem configuração, só
 * fica menos ajustada aos padrões daquele repo.
 */
function loadConfig(dir, filename = CONFIG_FILENAME) {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    return DEFAULTS;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw) || {};
  return {
    projeto: parsed.projeto || DEFAULTS.projeto,
    requisito: { padroes: parsed.requisito?.padroes || DEFAULTS.requisito.padroes },
    diff: {
      max_linhas: parsed.diff?.max_linhas ?? DEFAULTS.diff.max_linhas,
      excluir: parsed.diff?.excluir || DEFAULTS.diff.excluir
    }
  };
}

module.exports = { loadConfig, CONFIG_FILENAME, DEFAULTS };
