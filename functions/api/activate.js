import { route, json, readJson, requireBindings, clientIp, sha256Hex } from '../_lib/http.js';
import { normaliseLicenseKey, activate } from '../_lib/auth.js';
import { hit, LIMITS } from '../_lib/ratelimit.js';

// POST /api/activate { license_key } -> { token, email, expires_in }
export const onRequest = route({
    POST: async ({ request, env }) => {
        requireBindings(env, ['NH_KV']);
        const body = await readJson(request);
        const licenseKey = normaliseLicenseKey(body.license_key);
        const ipId = await sha256Hex(`ip:${clientIp(request)}`);
        await hit(env.NH_KV, 'public', ipId, LIMITS.publicPerIp, 'Too many activation attempts from your network today. Please try again tomorrow or email launchgrid.hq@proton.me.');
        const result = await activate(env, licenseKey);
        return json(result);
    },
});
