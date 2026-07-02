'use strict';

const { generateMarkdown } = require('../../scripts/generate-md');

function marker(repo, prNumber) {
  return `<!-- pr-registry:${repo}/${prNumber} -->`;
}

/**
 * Corpo do comentário — gerado EXCLUSIVAMENTE a partir do registro já
 * validado contra o schema (mesma função usada para o .md commitado). O
 * texto livre devolvido pelo LLM nunca é postado diretamente no PR: ele só
 * chega ao usuário depois de ter sido decomposto em campos estruturados e
 * validado por enums fechados (RF4), o que contém o raio de dano de uma
 * eventual tentativa de manipulação embutida no diff/descrição/transcript
 * (ver regra de CONTEÚDO NÃO CONFIÁVEL em prompts/categorizador.md).
 */
function buildCommentBody(registro, { repo, prNumber }) {
  return `${marker(repo, prNumber)}\n${generateMarkdown(registro)}`;
}

/**
 * Cria ou atualiza o comentário de registro no PR, usando o marcador HTML
 * como chave de idempotência (princípio 7 / RF7) — reruns e reaberturas
 * atualizam o comentário existente em vez de duplicá-lo.
 */
async function upsertComment({ registro, repo, prNumber, listComments, createComment, updateComment }) {
  const body = buildCommentBody(registro, { repo, prNumber });
  const mark = marker(repo, prNumber);

  const comentarios = await listComments();
  const existente = comentarios.find((c) => typeof c.body === 'string' && c.body.includes(mark));

  if (existente) {
    await updateComment(existente.id, body);
    return { action: 'updated', commentId: existente.id };
  }

  const criado = await createComment(body);
  return { action: 'created', commentId: criado.id };
}

module.exports = { buildCommentBody, upsertComment, marker };
