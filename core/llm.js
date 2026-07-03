'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Chamada headless à API Anthropic (RF2 / princípio 3) — roda dentro do job
 * de CI, nunca em sessão interativa. `fetchImpl` é injetável para testes.
 */
async function callClaude({
  apiKey,
  systemPrompt,
  userPrompt,
  model = DEFAULT_MODEL,
  maxTokens = 4096,
  fetchImpl = fetch
}) {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY ausente — chamada ao LLM não pode ser feita.');
  }

  const res = await fetchImpl(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API respondeu ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.content || []).map((block) => block.text || '').join('');
}

module.exports = { callClaude, ANTHROPIC_API_URL, DEFAULT_MODEL };
