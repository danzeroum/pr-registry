'use strict';

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema', 'registro.schema.json');
const MAX_SNIPPET_LINES = 10;

function loadSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function buildValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(loadSchema());
}

let cachedValidator = null;

/**
 * Valida um objeto de registro contra o JSON Schema + regras extras que o
 * schema não expressa bem (contagem de linhas do snippet, justificativa
 * não-vazia por ação já coberta por minLength, mas checada aqui de novo
 * para dar mensagens de erro mais claras).
 */
function validateRegistro(registro) {
  if (!cachedValidator) {
    cachedValidator = buildValidator();
  }

  const errors = [];
  const schemaValid = cachedValidator(registro);
  if (!schemaValid) {
    for (const err of cachedValidator.errors) {
      errors.push(`${err.instancePath || '(root)'} ${err.message}`);
    }
  }

  if (Array.isArray(registro?.acoes)) {
    registro.acoes.forEach((acao, idx) => {
      if (typeof acao.snippet === 'string' && acao.snippet.length > 0) {
        const lineCount = acao.snippet.split('\n').length;
        if (lineCount > MAX_SNIPPET_LINES) {
          errors.push(
            `/acoes/${idx}/snippet excede o limite de ${MAX_SNIPPET_LINES} linhas (tem ${lineCount})`
          );
        }
      }
      if (!acao.justificativa || acao.justificativa.trim().length === 0) {
        errors.push(`/acoes/${idx}/justificativa é obrigatória e não pode ser vazia`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateRegistro, MAX_SNIPPET_LINES };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node scripts/validate.js <registro.json>');
    process.exit(1);
  }
  const registro = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { valid, errors } = validateRegistro(registro);
  if (valid) {
    console.log(`OK: ${file} é válido.`);
    process.exit(0);
  } else {
    console.error(`INVÁLIDO: ${file}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}
