'use strict';

// Adaptador CLI fino sobre core/scrub.js — a lógica vive no core (Fase 3:
// extração para servir tanto a Action quanto o poller do serviço).
const fs = require('fs');
const { scrubText, scrubObject, loadPatterns, REDACTED } = require('../core/scrub');

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
