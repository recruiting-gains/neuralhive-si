import { route, json, requireBindings } from '../_lib/http.js';

// POST /api/logout -> deletes the current session token
export const onRequest = route({
    POST: async ({ request, env }) => {
        requireBindings(env, ['NH_KV']);
        const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
        if (m) await env.NH_KV.delete(`sess:${m[1]}`);
        return json({ ok: true });
    },
});
