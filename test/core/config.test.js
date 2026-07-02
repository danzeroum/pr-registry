'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('../../core/config');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pr-registry-config-'));
}

test('retorna defaults quando pr-registry.yml não existe', () => {
  const dir = makeTempDir();
  const config = loadConfig(dir);
  assert.equal(config.projeto, null);
  assert.deepEqual(config.diff.excluir, []);
  assert.equal(config.diff.max_linhas, 4000);
});

test('carrega valores customizados do pr-registry.yml', () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, 'pr-registry.yml'),
    [
      'projeto: auth-service',
      'requisito:',
      '  padroes:',
      "    - 'XYZ-(\\d+)'",
      'diff:',
      '  max_linhas: 8000',
      '  excluir:',
      "    - '**/*.snap'"
    ].join('\n')
  );
  const config = loadConfig(dir);
  assert.equal(config.projeto, 'auth-service');
  assert.deepEqual(config.requisito.padroes, ['XYZ-(\\d+)']);
  assert.equal(config.diff.max_linhas, 8000);
  assert.deepEqual(config.diff.excluir, ['**/*.snap']);
});
