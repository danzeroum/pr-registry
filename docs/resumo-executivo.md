# PR Registry — Resumo Executivo

## O problema

Quando um time desenvolve software — com ou sem apoio de IA — o registro
de "o que foi feito e por quê" costuma ficar espalhado em conversas de
chat, mensagens e na cabeça de quem programou. Depois de alguns meses,
ninguém consegue responder com confiança: *o que exatamente foi entregue
para o pedido X? Está pronto? O que falta?*

## O que o sistema faz

Toda vez que uma mudança de código é concluída (um "PR" mergeado), o
sistema lê o que mudou, entende o que foi feito e por quê, e grava um
registro organizado — automaticamente, sem que ninguém precise copiar e
colar nada. Esse registro conecta a entrega ao pedido de origem (uma
história, uma issue, um chamado), e fica disponível num painel visual.

## O que cada pessoa vê

- **Quem desenvolve** vê o detalhe técnico: o que mudou, em qual parte do
  sistema, e o trecho de código relevante.
- **Gestores** veem um resumo consolidado por projeto: quanto foi
  entregue, em quais áreas, o que ainda está pendente, e a tendência ao
  longo do tempo.
- **Analistas de negócio** navegam por pedido/história, não por código:
  "isso já foi entregue? O que exatamente foi feito?" — em linguagem sem
  jargão técnico, propositalmente sem nenhum termo de programação.

## Por que isso importa

- **Rastreabilidade:** todo trabalho fica ligado ao pedido que o originou.
  Quando não é possível identificar essa ligação, o sistema sinaliza —
  não esconde a lacuna.
- **Sem esforço extra do time:** nada precisa ser instalado ou preenchido
  manualmente por quem desenvolve. Cadastrar um projeto é o único passo.
- **Falhas não travam o trabalho:** se alguma etapa automática falhar (por
  exemplo, uma indisponibilidade momentânea), o sistema grava o que
  conseguiu e sinaliza a pendência para revisão — nunca bloqueia a entrega
  do time.

## Onde o projeto está hoje

O sistema está **construído e testado** (mais de 160 verificações
automáticas), mas ainda não processou nenhum PR real — só exemplos
preparados para teste. O que falta é puramente operacional: três
credenciais de acesso (leitura do GitHub, login da equipe, e o serviço de
IA usado na categorização), seguidas de um período de validação com dados
reais antes de ligar para todos os projetos. Esse plano está detalhado em
`docs/rollout.md`, em três etapas: validação técnica, um piloto pequeno de
2-3 projetos por 1-2 semanas, e só então a expansão completa.

## O que isso custa para operar

Um serviço simples (um único processo), hospedado num único lugar (nuvem
ou servidor interno), mais o custo por uso do serviço de IA — proporcional
ao volume de código mudado, não ao número de projetos cadastrados. Sem
software adicional para instalar nos repositórios de origem.
