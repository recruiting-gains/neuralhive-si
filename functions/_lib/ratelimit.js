import { HttpError } from './http.js';

// Simple fixed-window daily counters in KV (UTC day). KV is eventually
// consistent, so limits are approximate under heavy concurrency; that is
// acceptable for abuse protection at this scale.
export const LIMITS = {
    chatPerLicense: 100, // chat messages per license per day
    previewPerIp: 3, // free landing-page previews per IP per day
    publicPerIp: 30, // all unauthenticated calls that hit Gumroad/AI (activate + preview) per IP per day
};

function utcDay(now = Date.now()) {
    return new Date(now).toISOString().slice(0, 10);
}

function secondsUntilUtcMidnight(now = Date.now()) {
    const d = new Date(now);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    return Math.max(1, Math.ceil((next - now) / 1000));
}

/**
 * Count one hit against `scope:id` for today. Throws 429 when the limit is reached.
 * Returns the number of remaining hits after this one.
 */
export async function hit(kv, scope, id, limit, message) {
    const key = `rl:${scope}:${id}:${utcDay()}`;
    const used = parseInt((await kv.get(key)) || '0', 10) || 0;
    if (used >= limit) {
        throw new HttpError(429, message || 'Daily limit reached. Please try again tomorrow.', 'rate_limited', {
            limit,
            retryAfter: secondsUntilUtcMidnight(),
        });
    }
    await kv.put(key, String(used + 1), { expirationTtl: 2 * 24 * 3600 });
    return limit - used - 1;
}

export async function remaining(kv, scope, id, limit) {
    const used = parseInt((await kv.get(`rl:${scope}:${id}:${utcDay()}`)) || '0', 10) || 0;
    return Math.max(0, limit - used);
}
