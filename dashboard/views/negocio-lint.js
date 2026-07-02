'use strict';

// Garante mecanicamente a regra da persona Analista de Negócio: o arquivo
// da view nunca pode acessar campos técnicos do registro. Roda como parte
// da suíte de testes (test/dashboard/negocio-lint.test.js) — falha o
// build se alguém reintroduzir `.snippet`, `.camada` etc. na view.

const CAMPOS_PROIBIDOS = [
  { nome: 'descricao (técnica)', regex: /\.descricao(?!_gestor)\b/ },
  { nome: 'resumo_geral', regex: /\.resumo_geral\b/ },
  { nome: 'snippet', regex: /\.snippet\b/ },
  { nome: 'justificativa', regex: /\.justificativa\b/ },
  { nome: 'camada', regex: /\.camada\b/ },
  { nome: 'tipo', regex: /\.tipo\b/ },
  { nome: 'arquivos_impactados', regex: /\.arquivos_impactados\b/ },
  { nome: 'dependencias', regex: /\.dependencias\b/ },
  { nome: 'impacto', regex: /\.impacto\b/ }
];

function removerComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function verificarNegocioView(codigoFonte) {
  const codigo = removerComentarios(codigoFonte);
  const violacoes = CAMPOS_PROIBIDOS.filter((c) => c.regex.test(codigo)).map((c) => c.nome);
  return { ok: violacoes.length === 0, violacoes };
}

module.exports = { verificarNegocioView, CAMPOS_PROIBIDOS };
