import { route, json, requireBindings } from '../_lib/http.js';
import { requireSession } from '../_lib/auth.js';
import { remaining, LIMITS } from '../_lib/ratelimit.js';

// GET /api/session -> current session info (also re-checks the license at most once per 24h)
export const onRequest = route({
    GET: async (context) => {
        requireBindings(context.env, ['NH_KV']);
        const { session, lid } = await requireSession(context);
        return json({
            email: session.email || '',
            created: session.created,
            limits: {
                messages_per_day: LIMITS.chatPerLicense,
                messages_remaining_today: await remaining(context.env.NH_KV, 'chat', lid, LIMITS.chatPerLicense),
            },
        });
    },
});
