'use strict';

const crypto = require('node:crypto');

/**
 * Sessão em cookie assinado (HMAC-SHA256), sem estado no servidor —
 * simples o bastante para um time pequeno operar, sem exigir um store de
 * sessão separado. O payload é JSON + base64url; a assinatura garante que
 * o cliente não pode forjar nem alterar o conteúdo (ex.: "sou membro da
 * org") sem conhecer o segredo do servidor.
 */
function base64UrlEncode(buf) {
  return buf.toString('base64url');
}

function assinar(payloadBase64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
}

function codificarSessao(payload, secret) {
  const payloadBase64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const assinatura = assinar(payloadBase64, secret);
  return `${payloadBase64}.${assinatura}`;
}

/**
 * Decodifica e valida a assinatura. Retorna null se o cookie estiver
 * ausente, malformado, ou com assinatura inválida (nunca lança para não
 * derrubar a rota por um cookie forjado ou expirado).
 */
function decodificarSessao(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const partes = cookieValue.split('.');
  if (partes.length !== 2) return null;
  const [payloadBase64, assinatura] = partes;

  const esperada = assinar(payloadBase64, secret);
  const bufA = Buffer.from(assinatura);
  const bufB = Buffer.from(esperada);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (payload.expiraEm && Date.now() > payload.expiraEm) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { codificarSessao, decodificarSessao };
