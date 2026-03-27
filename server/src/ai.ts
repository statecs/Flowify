import { logger } from './logger';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface AIResult {
  outputText: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000
): Promise<AIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
    logger.error(`[AI] OpenAI API error ${response.status}:`, JSON.stringify(errorData));
    throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || errorData.message || 'Request failed'}`);
  }

  const data = await response.json() as any;

  if (!data?.choices?.[0]?.message?.content || !data?.usage) {
    logger.error('[AI] Unexpected OpenAI response structure:', JSON.stringify(data));
    throw new Error('OpenAI API returned unexpected response structure');
  }

  return {
    outputText: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens
  };
}

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096
): Promise<AIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
    logger.error(`[AI] Anthropic API error ${response.status}:`, JSON.stringify(errorData));
    throw new Error(`Anthropic API error (${response.status}): ${errorData.error?.message || errorData.message || 'Request failed'}`);
  }

  const data = await response.json() as any;

  if (!data?.content?.[0]?.text || !data?.usage) {
    logger.error('[AI] Unexpected Anthropic response structure:', JSON.stringify(data));
    throw new Error('Anthropic API returned unexpected response structure');
  }

  return {
    outputText: data.content[0].text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

export async function callOpenAIVision(
  systemPrompt: string,
  contentParts: any[],
  maxTokens: number = 4000
): Promise<AIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
    logger.error(`[AI] OpenAI Vision API error ${response.status}:`, JSON.stringify(errorData));
    throw new Error(`OpenAI Vision API error (${response.status}): ${errorData.error?.message || errorData.message || 'Request failed'}`);
  }

  const data = await response.json() as any;

  if (!data?.choices?.[0]?.message?.content || !data?.usage) {
    logger.error('[AI] Unexpected OpenAI Vision response structure:', JSON.stringify(data));
    throw new Error('OpenAI Vision API returned unexpected response structure');
  }

  return {
    outputText: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens
  };
}
