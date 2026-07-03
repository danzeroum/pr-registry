'use strict';

const { DatabaseSync } = require('node:sqlite');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL,
  repo TEXT NOT NULL,
  padroes_requisito TEXT NOT NULL DEFAULT '[]',
  comentar_pr INTEGER NOT NULL DEFAULT 0,
  cursor_iso TEXT,
  criado_em TEXT NOT NULL,
  UNIQUE(org, repo)
);

CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id),
  repo TEXT NOT NULL,
  pr_id TEXT NOT NULL,
  json TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  modo TEXT NOT NULL,
  origem TEXT NOT NULL,
  data_merge TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE(repo, pr_id)
);

CREATE TABLE IF NOT EXISTS execucoes_poller (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id),
  timestamp TEXT NOT NULL,
  prs_processados INTEGER NOT NULL DEFAULT 0,
  erros TEXT NOT NULL DEFAULT '[]',
  duracao_ms INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * Abre (ou cria) o banco SQLite via node:sqlite — sem dependência nativa
 * externa (evita problemas de compilação de módulos como better-sqlite3).
 * Todo o acesso a dados do serviço passa por este módulo: é a camada que
 * permite trocar para Postgres depois sem tocar em poller.js/reprocessar.js.
 */
function abrirBanco(caminho = ':memory:') {
  const db = new DatabaseSync(caminho);
  db.exec(SCHEMA_SQL);
  return db;
}

function agoraIso() {
  return new Date().toISOString();
}

function cadastrarProjeto(db, { org, repo, padroesRequisito = [], comentarPr = false, cursorIso = null }) {
  const stmt = db.prepare(
    `INSERT INTO projetos (org, repo, padroes_requisito, comentar_pr, cursor_iso, criado_em)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(org, repo, JSON.stringify(padroesRequisito), comentarPr ? 1 : 0, cursorIso, agoraIso());
  return Number(info.lastInsertRowid);
}

function linhaParaProjeto(linha) {
  if (!linha) return null;
  return {
    id: linha.id,
    org: linha.org,
    repo: linha.repo,
    padroesRequisito: JSON.parse(linha.padroes_requisito),
    comentarPr: Boolean(linha.comentar_pr),
    cursorIso: linha.cursor_iso,
    criadoEm: linha.criado_em
  };
}

function listarProjetos(db) {
  const linhas = db.prepare('SELECT * FROM projetos ORDER BY id').all();
  return linhas.map(linhaParaProjeto);
}

function buscarProjeto(db, { org, repo }) {
  const linha = db.prepare('SELECT * FROM projetos WHERE org = ? AND repo = ?').get(org, repo);
  return linhaParaProjeto(linha);
}

function atualizarProjeto(db, { id, comentarPr }) {
  const info = db.prepare('UPDATE projetos SET comentar_pr = ? WHERE id = ?').run(comentarPr ? 1 : 0, id);
  return { updated: info.changes > 0 };
}

function registroExiste(db, { repo, prId }) {
  const linha = db.prepare('SELECT 1 FROM registros WHERE repo = ? AND pr_id = ?').get(repo, prId);
  return Boolean(linha);
}

/**
 * Insere um novo registro e avança o cursor do projeto numa única
 * transação — se o processo cair entre as duas escritas, ou as duas
 * acontecem ou nenhuma acontece (nunca um registro "órfão" sem cursor
 * avançado, nem um cursor avançado sem o registro correspondente).
 *
 * O INSERT usa OR IGNORE: se o PR já existir (UNIQUE(repo, pr_id) —
 * reprocessamento da janela de sobreposição do cursor), a inserção é um
 * no-op silencioso e só o cursor avança, se for o caso.
 */
function inserirRegistroEAvancarCursor(
  db,
  { projetoId, repo, prId, registro, novoCursorIso }
) {
  const agora = agoraIso();
  const inserirStmt = db.prepare(
    `INSERT OR IGNORE INTO registros
       (projeto_id, repo, pr_id, json, schema_version, modo, origem, data_merge, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const avancarStmt = db.prepare('UPDATE projetos SET cursor_iso = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    const info = inserirStmt.run(
      projetoId,
      repo,
      prId,
      JSON.stringify(registro),
      registro.schema_version,
      registro.modo,
      registro.origem || 'evento',
      registro.data_merge || null,
      agora,
      agora
    );
    if (novoCursorIso) {
      avancarStmt.run(novoCursorIso, projetoId);
    }
    db.exec('COMMIT');
    return { inserted: info.changes > 0 };
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

function avancarCursor(db, { projetoId, cursorIso }) {
  db.prepare('UPDATE projetos SET cursor_iso = ? WHERE id = ?').run(cursorIso, projetoId);
}

function atualizarRegistro(db, { repo, prId, registro }) {
  const stmt = db.prepare(
    `UPDATE registros SET json = ?, schema_version = ?, modo = ?, atualizado_em = ?
     WHERE repo = ? AND pr_id = ?`
  );
  const info = stmt.run(JSON.stringify(registro), registro.schema_version, registro.modo, agoraIso(), repo, prId);
  return { updated: info.changes > 0 };
}

function linhaParaRegistro(linha) {
  if (!linha) return null;
  return { ...linha, json: JSON.parse(linha.json) };
}

function listarRegistrosDegradados(db, { projetoId } = {}) {
  const linhas = projetoId
    ? db.prepare("SELECT * FROM registros WHERE modo = 'degradado' AND projeto_id = ?").all(projetoId)
    : db.prepare("SELECT * FROM registros WHERE modo = 'degradado'").all();
  return linhas.map(linhaParaRegistro);
}

function listarRegistros(db, { projetoId } = {}) {
  const linhas = projetoId
    ? db.prepare('SELECT * FROM registros WHERE projeto_id = ? ORDER BY data_merge').all(projetoId)
    : db.prepare('SELECT * FROM registros ORDER BY data_merge').all();
  return linhas.map(linhaParaRegistro);
}

/**
 * Filtragem feita em JS sobre os registros já carregados, não em SQL —
 * na escala de referência (20 projetos, dezenas de PRs/dia agregados) o
 * dataset inteiro cabe em memória sem esforço, e evita depender de
 * funções JSON1 do SQLite que variam entre builds. Se o volume crescer
 * o bastante para doer, é aqui — só aqui — que a query muda; nenhum
 * chamador (dashboard, testes) depende de como a filtragem é feita.
 */
function listarRegistrosFiltrados(db, filtros = {}) {
  const { projetoId, camada, tipo, modo, origem, requisitoId, desde, ate } = filtros;
  let registros = listarRegistros(db, projetoId ? { projetoId } : undefined);

  if (modo) registros = registros.filter((r) => r.json.modo === modo);
  if (origem) registros = registros.filter((r) => r.json.origem === origem);
  if (requisitoId) registros = registros.filter((r) => r.json.requisito?.id === requisitoId);
  if (desde) registros = registros.filter((r) => r.data_merge && r.data_merge >= desde);
  if (ate) registros = registros.filter((r) => r.data_merge && r.data_merge <= ate);
  if (camada) registros = registros.filter((r) => (r.json.acoes || []).some((a) => a.camada === camada));
  if (tipo) registros = registros.filter((r) => (r.json.acoes || []).some((a) => a.tipo === tipo));

  return registros;
}

/**
 * Visão de primeira classe da persona Analista de Negócio (RF8 revisado):
 * agrega os PRs por requisito, sem expor camada/tipo/snippet — só a
 * contagem de PRs e o status de completude, que a view de negócio traduz
 * para linguagem sem jargão.
 */
function agregarPorRequisito(db, filtros = {}) {
  const registros = listarRegistrosFiltrados(db, filtros);
  const porRequisito = new Map();

  for (const r of registros) {
    const req = r.json.requisito || { id: 'nao-vinculado', titulo: '' };
    if (!porRequisito.has(req.id)) {
      porRequisito.set(req.id, { requisitoId: req.id, titulo: req.titulo, prs: [] });
    }
    porRequisito.get(req.id).prs.push(r);
  }

  return Array.from(porRequisito.values()).map((g) => ({
    requisitoId: g.requisitoId,
    titulo: g.titulo,
    totalPrs: g.prs.length,
    prsCompletos: g.prs.filter((p) => p.json.modo === 'completo').length,
    prsDegradados: g.prs.filter((p) => p.json.modo === 'degradado').length,
    naoVinculado: g.requisitoId === 'nao-vinculado',
    prs: g.prs
  }));
}

function registrarExecucao(db, { projetoId, prsProcessados, erros, duracaoMs }) {
  const stmt = db.prepare(
    `INSERT INTO execucoes_poller (projeto_id, timestamp, prs_processados, erros, duracao_ms)
     VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(projetoId, agoraIso(), prsProcessados, JSON.stringify(erros || []), duracaoMs);
}

function listarExecucoes(db, { projetoId } = {}) {
  const linhas = projetoId
    ? db.prepare('SELECT * FROM execucoes_poller WHERE projeto_id = ? ORDER BY id').all(projetoId)
    : db.prepare('SELECT * FROM execucoes_poller ORDER BY id').all();
  return linhas.map((l) => ({ ...l, erros: JSON.parse(l.erros) }));
}

module.exports = {
  abrirBanco,
  cadastrarProjeto,
  listarProjetos,
  buscarProjeto,
  registroExiste,
  inserirRegistroEAvancarCursor,
  avancarCursor,
  atualizarRegistro,
  atualizarProjeto,
  listarRegistrosDegradados,
  listarRegistros,
  listarRegistrosFiltrados,
  agregarPorRequisito,
  registrarExecucao,
  listarExecucoes
};
