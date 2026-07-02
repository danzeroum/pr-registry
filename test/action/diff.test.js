'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { truncateDiff } = require('../../action/src/diff');

function makePatch(lines) {
  return Array.from({ length: lines }, (_, i) => `+linha ${i}`).join('\n');
}

test('não trunca quando tudo cabe no orçamento', () => {
  const files = [
    { path: 'src/a.ts', patch: makePatch(10) },
    { path: 'src/b.ts', patch: makePatch(20) }
  ];
  const { arquivos, truncado } = truncateDiff(files, { maxLines: 100 });
  assert.equal(arquivos.length, 2);
  assert.equal(truncado, null);
});

test('exclui lockfiles automaticamente e conta como omitidos', () => {
  const files = [
    { path: 'package-lock.json', patch: makePatch(500) },
    { path: 'src/a.ts', patch: makePatch(10) }
  ];
  const { arquivos, truncado } = truncateDiff(files, { maxLines: 1000 });
  assert.deepEqual(arquivos.map((f) => f.path), ['src/a.ts']);
  assert.equal(truncado.arquivos_omitidos, 1);
  assert.equal(truncado.linhas_omitidas, 500);
});

test('trunca por orçamento de linhas, priorizando arquivos menores', () => {
  const files = [
    { path: 'src/grande.ts', patch: makePatch(300) },
    { path: 'src/pequeno.ts', patch: makePatch(10) }
  ];
  const { arquivos, truncado } = truncateDiff(files, { maxLines: 50 });
  assert.deepEqual(arquivos.map((f) => f.path), ['src/pequeno.ts']);
  assert.equal(truncado.arquivos_omitidos, 1);
  assert.equal(truncado.linhas_omitidas, 300);
});

test('preserva a ordem original dos arquivos incluídos', () => {
  const files = [
    { path: 'src/b.ts', patch: makePatch(20) },
    { path: 'src/a.ts', patch: makePatch(5) }
  ];
  const { arquivos } = truncateDiff(files, { maxLines: 100 });
  assert.deepEqual(arquivos.map((f) => f.path), ['src/b.ts', 'src/a.ts']);
});

test('shape do campo truncado é compatível com diff_truncado do schema', () => {
  const files = [{ path: 'dist/bundle.js', patch: makePatch(50) }];
  const { truncado } = truncateDiff(files, { maxLines: 1000 });
  assert.deepEqual(Object.keys(truncado).sort(), ['arquivos_omitidos', 'linhas_omitidas']);
});
