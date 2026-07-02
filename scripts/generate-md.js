'use strict';

// Adaptador CLI fino sobre core/generate-md.js — a lógica vive no core
// (Fase 3: extração para servir tanto a Action quanto o poller do serviço).
const fs = require('fs');
const { generateMarkdown } = require('../core/generate-md');

module.exports = { generateMarkdown };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node scripts/generate-md.js <registro.json>');
    process.exit(1);
  }
  const registro = JSON.parse(fs.readFileSync(file, 'utf8'));
  const md = generateMarkdown(registro);
  const outPath = file.replace(/\.json$/, '.md');
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Gerado: ${outPath}`);
}
