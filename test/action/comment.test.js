'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildCommentBody, upsertComment, marker } = require('../../action/src/comment');

const REGISTRO = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'registros', '2026', 'exemplo-repo', 'PR-101.json'), 'utf8')
);

test('corpo do comentário contém o marcador de idempotência e o markdown gerado do registro', () => {
  const body = buildCommentBody(REGISTRO, { repo: 'exemplo-repo', prNumber: 101 });
  assert.match(body, /^<!-- pr-registry:exemplo-repo\/101 -->\n/);
  assert.match(body, /## Resumo Geral/);
  assert.ok(body.includes(REGISTRO.resumo_geral.slice(0, 20)));
});

test('cria comentário quando não existe nenhum com o marcador (primeiro merge)', async () => {
  const criados = [];
  const listComments = async () => [];
  const createComment = async (body) => {
    criados.push(body);
    return { id: 'novo-id-1' };
  };
  const updateComment = async () => {
    throw new Error('não deveria chamar update na criação');
  };

  const resultado = await upsertComment({
    registro: REGISTRO,
    repo: 'exemplo-repo',
    prNumber: 101,
    listComments,
    createComment,
    updateComment
  });

  assert.equal(resultado.action, 'created');
  assert.equal(criados.length, 1);
});

test('critério de aceite: rerun no mesmo PR atualiza o comentário existente, não duplica', async () => {
  const mark = marker('exemplo-repo', 101);
  const comentariosExistentes = [
    { id: 'outro-comentario', body: 'Comentário de outra pessoa, sem relação.' },
    { id: 'comentario-registro', body: `${mark}\n# versão antiga do registro` }
  ];

  const atualizados = [];
  let criadosCount = 0;

  const listComments = async () => comentariosExistentes;
  const createComment = async () => {
    criadosCount += 1;
    return { id: 'nao-deveria-criar' };
  };
  const updateComment = async (id, body) => {
    atualizados.push({ id, body });
  };

  const resultado = await upsertComment({
    registro: REGISTRO,
    repo: 'exemplo-repo',
    prNumber: 101,
    listComments,
    createComment,
    updateComment
  });

  assert.equal(resultado.action, 'updated');
  assert.equal(resultado.commentId, 'comentario-registro');
  assert.equal(criadosCount, 0, 'não deve criar um segundo comentário em re-run');
  assert.equal(atualizados.length, 1);
  assert.match(atualizados[0].body, new RegExp(mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('não confunde comentários de outros PRs do mesmo repo (chave inclui pr_number)', async () => {
  const comentarioDeOutroPr = [{ id: 'x', body: `${marker('exemplo-repo', 999)}\n# outro PR` }];
  let criou = false;
  const resultado = await upsertComment({
    registro: REGISTRO,
    repo: 'exemplo-repo',
    prNumber: 101,
    listComments: async () => comentarioDeOutroPr,
    createComment: async () => {
      criou = true;
      return { id: 'novo' };
    },
    updateComment: async () => {
      throw new Error('não deveria atualizar comentário de outro PR');
    }
  });
  assert.equal(resultado.action, 'created');
  assert.equal(criou, true);
});
