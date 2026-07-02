'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderDev } = require('../../dashboard/views/dev');
const { renderGestor, heatmapPorCamada, statusPorProjeto, pendenciasAbertas, tendenciaMensal } = require('../../dashboard/views/gestor');
const { renderNegocio } = require('../../dashboard/views/negocio');
const { agregarPorRequisito } = require('../../service/db');
const db = require('../../service/db');

const REGISTRO_101 = require('../../registros/2026/exemplo-repo/PR-101.json');
const REGISTRO_102 = require('../../registros/2026/exemplo-repo/PR-102.json');
const REGISTRO_103 = require('../../registros/2026/exemplo-repo/PR-103.json');

function seedBanco() {
  const conn = db.abrirBanco();
  const projetoId = db.cadastrarProjeto(conn, { org: 'org', repo: 'exemplo-repo' });
  for (const r of [REGISTRO_101, REGISTRO_102, REGISTRO_103]) {
    db.inserirRegistroEAvancarCursor(conn, {
      projetoId,
      repo: r.repo,
      prId: r.pr_id,
      registro: r,
      novoCursorIso: null
    });
  }
  return { conn, projetoId };
}

test('renderDev escapa HTML e inclui camada/tipo/snippet/justificativa', () => {
  const { conn } = seedBanco();
  const registros = db.listarRegistros(conn);
  const html = renderDev(registros);
  assert.match(html, /PR-101/);
  assert.match(html, /backend/);
  assert.match(html, /Justificativa:/);
  assert.match(html, /<pre>/);
});

test('renderDev escapa conteúdo perigoso (defesa contra XSS a partir de dados do PR)', () => {
  const registroMalicioso = JSON.parse(JSON.stringify(REGISTRO_101));
  registroMalicioso.titulo_pr = '<script>alert(1)</script>';
  const html = renderDev([{ json: registroMalicioso }]);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('renderGestor inclui heatmap, status por projeto e pendências', () => {
  const { conn } = seedBanco();
  const registros = db.listarRegistros(conn);
  const html = renderGestor(registros);
  assert.match(html, /Status por Projeto/);
  assert.match(html, /Heatmap de Volume por Camada/);
  assert.match(html, /Pendências Abertas/);
  assert.match(html, /exemplo-repo/);
});

test('heatmapPorCamada conta ações por camada corretamente', () => {
  const { conn } = seedBanco();
  const registros = db.listarRegistros(conn);
  const heatmap = heatmapPorCamada(registros);
  const backend = heatmap.find((h) => h.camada === 'backend');
  assert.ok(backend.total >= 2); // PR-101 tem 2 ações backend, PR-102 tem 1
});

test('pendenciasAbertas lista a pendência do PR-103 (sem requisito vinculado)', () => {
  const { conn } = seedBanco();
  const registros = db.listarRegistros(conn);
  const pendencias = pendenciasAbertas(registros);
  assert.ok(pendencias.some((p) => p.prId === 'PR-103'));
});

test('renderNegocio agrupa por requisito e usa linguagem de negócio', () => {
  const { conn } = seedBanco();
  const agregado = agregarPorRequisito(conn);
  const html = renderNegocio(agregado);
  assert.match(html, /Login social/); // requisito.titulo do PR-101
  assert.match(html, /entrega/i);
  assert.ok(!html.includes('backend')); // camada nunca deve vazar para essa view
});

test('renderNegocio marca requisito não-vinculado com texto de negócio', () => {
  const { conn } = seedBanco();
  const agregado = agregarPorRequisito(conn);
  const html = renderNegocio(agregado);
  assert.match(html, /sem história\/requisito vinculado/i);
});

test('tendenciaMensal agrupa por mês a partir de data_merge', () => {
  const { conn } = seedBanco();
  const registros = db.listarRegistros(conn);
  const tendencia = tendenciaMensal(registros);
  assert.ok(tendencia.length >= 1);
  assert.ok(tendencia.every((t) => /^\d{4}-\d{2}$/.test(t.mes)));
});

test('statusPorProjeto conta completos e degradados por repo', () => {
  const { conn } = seedBanco();
  const registros = db.listarRegistros(conn);
  const status = statusPorProjeto(registros);
  const exemploRepo = status.find((s) => s.repo === 'exemplo-repo');
  assert.equal(exemploRepo.total, 3);
  assert.equal(exemploRepo.completos, 3); // os 3 exemplos são modo completo
});
