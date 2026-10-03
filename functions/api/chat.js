import { route, json, readJson, requireBindings, cleanString, HttpError } from '../_lib/http.js';
import { requireSession } from '../_lib/auth.js';
import { getAgent, getHistory, saveHistory, assertAgentId } from '../_lib/agents.js';
import { buildSystemPrompt } from '../_lib/templates.js';
import { runChat, CHAT_MODELS } from '../_lib/ai.js';
import { hit, LIMITS } from '../_lib/ratelimit.js';

const CONTEXT_MESSAGES = 20; // stored messages sent to the model as context

// GET  /api/chat?agent_id=... -> { messages }  (last 50 stored messages)
// POST /api/chat { agent_id, messages } -> { reply, model, remaining_today }
//   Only the final user message from `messages` is used; prior context comes from
//   the server-side history so clients cannot inject system/assistant turns.
export const onRequest = route({
    GET: async (context) => {
        requireBindings(context.env, ['NH_KV']);
        const { lid } = await requireSession(context);
        const id = assertAgentId(new URL(context.request.url).searchParams.get('agent_id'));
        await getAgent(context.env.NH_KV, lid, id);
        return json({ messages: await getHistory(context.env.NH_KV, lid, id) });
    },
    POST: async (context) => {
        const { env } = context;
        requireBindings(env, ['NH_KV', 'AI']);
        const { lid } = await requireSession(context);
        const body = await readJson(context.request);
        const id = assertAgentId(body.agent_id);

        if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 100) {
            throw new HttpError(400, '"messages" must be a non-empty array.', 'validation_error', { field: 'messages' });
        }
        const last = body.messages[body.messages.length - 1];
        if (!last || typeof last !== 'object' || last.role !== 'user') {
            throw new HttpError(400, 'The last message must have role "user".', 'validation_error', { field: 'messages' });
        }
        const content = cleanString(last.content, 'content', { min: 1, max: 4000 });

        const kv = env.NH_KV;
        const agent = await getAgent(kv, lid, id);
        const remainingToday = await hit(kv, 'chat', lid, LIMITS.chatPerLicense, `You've reached today's limit of ${LIMITS.chatPerLicense} messages. It resets at midnight UTC.`);

        const history = await getHistory(kv, lid, id);
        const context_ = history
            .slice(-CONTEXT_MESSAGES)
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m) => ({ role: m.role, content: m.content }));
        const messages = [{ role: 'system', content: buildSystemPrompt(agent) }, ...context_, { role: 'user', content }];

        const { text, model } = await runChat(env, messages, { maxTokens: 1024, models: CHAT_MODELS });
        const now = new Date().toISOString();
        const userMsg = { role: 'user', content, ts: now };
        const reply = { role: 'assistant', content: text.slice(0, 8000), ts: new Date().toISOString() };
        await saveHistory(kv, lid, id, [...history, userMsg, reply]);
        return json({ reply, model, remaining_today: remainingToday });
    },
});
