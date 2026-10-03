import { HttpError } from './http.js';

export const MODELS = {
    primary: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    fallback: '@cf/meta/llama-3.1-8b-instruct',
    fast: '@cf/meta/llama-3.1-8b-instruct-fast',
};

// Chat: big model first, small model as fallback. Preview (free, unauthenticated): small models only, for cost control.
export const CHAT_MODELS = [MODELS.primary, MODELS.fallback];
export const PREVIEW_MODELS = [MODELS.fast, MODELS.fallback];

function extractText(result) {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (typeof result.response === 'string') return result.response;
    if (result.response && typeof result.response === 'object') return JSON.stringify(result.response);
    if (result.result && typeof result.result.response === 'string') return result.result.response;
    return '';
}

/**
 * Run a chat completion on Workers AI, trying each model in `models` in order
 * until one returns text. Returns { text, model }.
 */
export async function runChat(env, messages, { maxTokens = 1024, temperature = 0.6, models = CHAT_MODELS } = {}) {
    const order = models;
    let lastErr = null;
    for (const model of order) {
        try {
            const result = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature });
            const text = extractText(result).trim();
            if (text) return { text, model };
            lastErr = new Error(`Empty response from ${model}`);
        } catch (err) {
            lastErr = err;
            console.error(`Workers AI error on ${model}:`, err && err.message ? err.message : err);
        }
    }
    console.error('All Workers AI models failed:', lastErr && lastErr.message);
    throw new HttpError(502, 'The SI model is busy or unavailable right now. Please try again in a moment.', 'ai_unavailable');
}

/** Pull the first JSON object out of a model reply (handles code fences / chatter). */
export function parseJsonObject(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [];
    if (fenced) candidates.push(fenced[1]);
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
    candidates.push(text);
    for (const c of candidates) {
        try {
            const obj = JSON.parse(c.trim());
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
        } catch {
            /* try next */
        }
    }
    return null;
}
