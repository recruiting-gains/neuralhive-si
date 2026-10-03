import { route, json, readJson, requireBindings, cleanString, clientIp, sha256Hex, HttpError } from '../_lib/http.js';
import { runChat, parseJsonObject } from '../_lib/ai.js';
import { hit, LIMITS } from '../_lib/ratelimit.js';
import { PREVIEW_SYSTEM, normalisePlan } from '../_lib/preview.js';

// POST /api/preview { prompt, model? } -> { plan: { name, role, tasks[3], first_reply }, remaining_today }
export const onRequest = route({
    POST: async ({ request, env }) => {
        requireBindings(env, ['NH_KV', 'AI']);
        const body = await readJson(request);
        const prompt = cleanString(body.prompt, 'prompt', { min: 10, max: 1000 });
        const preferFast = body.model === 'si-1-fast';

        const ipId = await sha256Hex(`ip:${clientIp(request)}`);
        const remainingToday = await hit(env.NH_KV, 'preview', ipId, LIMITS.previewPerIp,
            `You've used your ${LIMITS.previewPerIp} free previews for today. Get NeuralHive Pro for unlimited SI teammates.`);
        await hit(env.NH_KV, 'public', ipId, LIMITS.publicPerIp, 'Too many requests from your network today. Please try again tomorrow.');

        const { text } = await runChat(
            env,
            [
                { role: 'system', content: PREVIEW_SYSTEM },
                { role: 'user', content: `Design an SI teammate for this request:\n"""\n${prompt}\n"""` },
            ],
            { maxTokens: 600, temperature: 0.5, preferFast },
        );
        const plan = normalisePlan(parseJsonObject(text));
        if (!plan) {
            throw new HttpError(502, "NeuralHive couldn't draft a plan for that one. Try rephrasing your description.", 'preview_parse_failed');
        }
        return json({ plan, remaining_today: remainingToday });
    },
});
