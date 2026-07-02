'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { callClaude } = require('../../action/src/llm');

test('monta a requisição corretamente e extrai o texto da resposta', async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"ok": true}' }] })
    };
  };

  const texto = await callClaude({
    apiKey: 'fake-key',
    systemPrompt: 'sys',
    userPrompt: 'user',
    fetchImpl
  });

  assert.equal(texto, '{"ok": true}');
  assert.equal(capturedUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(capturedOptions.headers['x-api-key'], 'fake-key');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.system, 'sys');
  assert.equal(body.messages[0].content, 'user');
});

test('lança erro descritivo quando a API responde com falha', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => 'unauthorized'
  });
  await assert.rejects(
    () => callClaude({ apiKey: 'bad-key', systemPrompt: 's', userPrompt: 'u', fetchImpl }),
    /Anthropic API respondeu 401/
  );
});

test('lança erro claro quando a API key está ausente', async () => {
  await assert.rejects(
    () => callClaude({ apiKey: undefined, systemPrompt: 's', userPrompt: 'u' }),
    /ANTHROPIC_API_KEY ausente/
  );
});
