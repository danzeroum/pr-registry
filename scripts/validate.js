'use strict';

// Adaptador CLI fino sobre core/validate.js — a lógica vive no core
// (Fase 3: extração para servir tanto a Action quanto o poller do serviço).
const fs = require('fs');
const { validateRegistro, MAX_SNIPPET_LINES } = require('../core/validate');

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
