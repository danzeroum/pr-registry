'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { generateMarkdown } = require('../scripts/generate-md.js');

const EXEMPLOS_DIR = path.join(__dirname, '..', 'registros', '2026', 'exemplo-repo');

function loadExemplo(nome) {
  const raw = fs.readFileSync(path.join(EXEMPLOS_DIR, nome), 'utf8');
  return JSON.parse(raw);
}

test('gera frontmatter YAML com os campos esperados', () => {
  const registro = loadExemplo('PR-101.json');
  const md = generateMarkdown(registro);
  assert.match(md, /^---\n/);
  assert.match(md, /pr_id: "PR-101"/);
  assert.match(md, /repo: "exemplo-repo"/);
  assert.match(md, /requisito_id: "PROJ-88"/);
  assert.match(md, /modo: completo/);
});

test('inclui as seções obrigatórias', () => {
  const registro = loadExemplo('PR-101.json');
  const md = generateMarkdown(registro);
  assert.match(md, /## Resumo Geral/);
  assert.match(md, /## Resumo para Gestores/);
  assert.match(md, /## Ações/);
  assert.match(md, /## Status Consolidado/);
});

test('agrupa ações por camada com contagem correta na tabela', () => {
  const registro = loadExemplo('PR-101.json');
  const md = generateMarkdown(registro);
  assert.match(md, /### Backend/);
  assert.match(md, /### Testes/);
  assert.match(md, /\| Backend \| 2 \|/);
  assert.match(md, /\| Testes \| 1 \|/);
  assert.match(md, /\| \*\*Total\*\* \| \*\*3\*\* \|/);
});

test('PR sem pendências mostra mensagem padrão', () => {
  const registro = loadExemplo('PR-101.json');
  const md = generateMarkdown(registro);
  assert.match(md, /_Nenhuma pendência registrada\._/);
});

test('PR com pendências lista cada uma', () => {
  const registro = loadExemplo('PR-103.json');
  const md = generateMarkdown(registro);
  assert.match(md, /\*\*Pendências:\*\*/);
  assert.match(md, /- PR sem requisito de origem identificado/);
});

test('marca justificativa inferida no markdown', () => {
  const registro = loadExemplo('PR-103.json');
  const md = generateMarkdown(registro);
  assert.match(md, /_\(inferida do diff\)_/);
});

test('markdown gerado é idêntico ao arquivo .md commitado (derivação 100% do JSON)', () => {
  for (const nome of ['PR-101', 'PR-102', 'PR-103']) {
    const registro = loadExemplo(`${nome}.json`);
    const gerado = generateMarkdown(registro);
    const commitado = fs.readFileSync(path.join(EXEMPLOS_DIR, `${nome}.md`), 'utf8');
    assert.equal(gerado, commitado, `${nome}.md diverge do gerado a partir do JSON`);
  }
});
