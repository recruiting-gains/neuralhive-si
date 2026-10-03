import { HttpError, randomToken, sha256Hex } from './http.js';
import { verifyLicense, REASON_MESSAGES } from './gumroad.js';

export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
export const REVERIFY_INTERVAL_MS = 24 * 3600 * 1000; // re-check Gumroad at most once per day per license
export const OUTAGE_GRACE_MS = 72 * 3600 * 1000; // keep serving a known-good license if Gumroad is down

const LICENSE_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;

export function normaliseLicenseKey(raw) {
    if (typeof raw !== 'string') throw new HttpError(400, '"license_key" is required.', 'validation_error', { field: 'license_key' });
    const key = raw.trim();
    if (!LICENSE_KEY_RE.test(key)) {
        throw new HttpError(400, 'That does not look like a license key. It should look like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX.', 'validation_error', {
            field: 'license_key',
        });
    }
    return key;
}

/** Stable, non-reversible id for a license (used in KV key names). */
export function licenseId(licenseKey) {
    return sha256Hex(`neuralhive:license:${licenseKey}`);
}

async function storeLicenseCheck(kv, lid, result, now) {
    await kv.put(
        `licv:${lid}`,
        JSON.stringify({ valid: result.valid, reason: result.reason || null, email: result.email || '', checked: now }),
        { expirationTtl: SESSION_TTL_SECONDS },
    );
}

/** Activate a license: always verifies with Gumroad, then issues a session. */
export async function activate(env, licenseKey, now = Date.now()) {
    const kv = env.NH_KV;
    const lid = await licenseId(licenseKey);
    const result = await verifyLicense(env, licenseKey);
    await storeLicenseCheck(kv, lid, result, now);
    if (!result.valid) {
        const status = result.reason === 'invalid_license' ? 401 : 402;
        throw new HttpError(status, REASON_MESSAGES[result.reason] || 'This license is not active.', result.reason);
    }
    const token = randomToken(32);
    const session = { license_key: licenseKey, email: result.email, created: new Date(now).toISOString() };
    await kv.put(`sess:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
    return { token, email: result.email, expires_in: SESSION_TTL_SECONDS };
}

function bearer(request) {
    const h = request.headers.get('Authorization') || '';
    const m = h.match(/^Bearer\s+(\S+)$/i);
    return m ? m[1] : null;
}

/**
 * Authenticate a request: valid session token + license still active
 * (re-verified with Gumroad at most once every 24h).
 * Returns { token, session, lid }.
 */
export async function requireSession(context, now = Date.now()) {
    const { request, env } = context;
    const kv = env.NH_KV;
    const token = bearer(request);
    if (!token || !TOKEN_RE.test(token)) {
        throw new HttpError(401, 'Please sign in with your NeuralHive Pro license key.', 'unauthorized');
    }
    const raw = await kv.get(`sess:${token}`);
    if (!raw) throw new HttpError(401, 'Your session has expired. Please enter your license key again.', 'session_expired');
    let session;
    try {
        session = JSON.parse(raw);
    } catch {
        await kv.delete(`sess:${token}`);
        throw new HttpError(401, 'Your session is invalid. Please enter your license key again.', 'session_expired');
    }
    const lid = await licenseId(session.license_key);

    let cached = null;
    try {
        cached = JSON.parse((await kv.get(`licv:${lid}`)) || 'null');
    } catch {
        cached = null;
    }

    let status = cached;
    if (!cached || typeof cached.checked !== 'number' || now - cached.checked >= REVERIFY_INTERVAL_MS) {
        try {
            const result = await verifyLicense(env, session.license_key);
            await storeLicenseCheck(kv, lid, result, now);
            status = { valid: result.valid, reason: result.reason || null, email: result.email || '', checked: now };
        } catch (err) {
            // Gumroad unreachable: keep a recently-verified license working for a grace period.
            if (err instanceof HttpError && err.status === 502 && cached && cached.valid && now - cached.checked < OUTAGE_GRACE_MS) {
                status = cached;
            } else {
                throw err;
            }
        }
    }

    if (!status.valid) {
        await kv.delete(`sess:${token}`);
        throw new HttpError(402, REASON_MESSAGES[status.reason] || 'Your NeuralHive Pro license is no longer active.', 'subscription_inactive', {
            reason: status.reason,
        });
    }
    return { token, session, lid };
}
