'use strict';

const crypto = require('node:crypto');

/**
 * CSRF via double-submit cookie: um token aleatório vai num cookie
 * separado (não httpOnly, para o template poder ecoá-lo num campo hidden)
 * e o formulário de admin envia o mesmo valor de volta. Um atacante em
 * outro domínio não consegue ler o cookie para replicar o valor no campo
 * hidden — é o suficiente para as rotas de escrita da admin, sem exigir
 * estado de sessão adicional no servidor.
 */
function gerarTokenCsrf() {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenCsrfValido(tokenCookie, tokenFormulario) {
  if (!tokenCookie || !tokenFormulario) return false;
  const bufA = Buffer.from(tokenCookie);
  const bufB = Buffer.from(tokenFormulario);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { gerarTokenCsrf, tokenCsrfValido };
