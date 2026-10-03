import { HttpError } from './http.js';

export const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';
// Public Gumroad product id for NeuralHive Pro (not a secret). GUMROAD_PRODUCT_ID env var overrides it.
export const DEFAULT_PRODUCT_ID = 'JN-C9Y88NN8W2i-lku9rpQ==';

/**
 * Verify a license key with Gumroad (does not increment the uses count).
 * Resolves to { valid: true, email, purchase } or { valid: false, reason }.
 * Throws HttpError(502) if Gumroad cannot be reached or answers unexpectedly.
 */
export async function verifyLicense(env, licenseKey) {
    const form = new URLSearchParams();
    // Gumroad requires product_id for products created after Jan 2023 (product_permalink is not accepted).
    form.set('product_id', (env.GUMROAD_PRODUCT_ID || DEFAULT_PRODUCT_ID).trim());
    form.set('license_key', licenseKey);
    form.set('increment_uses_count', 'false');

    let res;
    try {
        res = await fetch(GUMROAD_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: form.toString(),
        });
    } catch (err) {
        console.error('Gumroad request failed:', err);
        throw new HttpError(502, 'Could not reach the license server. Please try again in a minute.', 'license_server_unreachable');
    }

    let data = null;
    try {
        data = await res.json();
    } catch {
        data = null;
    }

    // Gumroad answers 404 + success:false for unknown keys / wrong product.
    if (data && data.success === false && (res.status === 404 || res.status === 400 || res.status === 200)) {
        console.warn('Gumroad rejected license:', res.status, data.message);
        return { valid: false, reason: 'invalid_license' };
    }
    if (!res.ok || !data || data.success !== true || !data.purchase) {
        console.error('Unexpected Gumroad response', res.status, data && data.message);
        throw new HttpError(502, 'The license server returned an unexpected response. Please try again later.', 'license_server_error');
    }

    const p = data.purchase;
    const inactive = inactiveReason(p);
    if (inactive) return { valid: false, reason: inactive, email: p.email || '' };
    return { valid: true, email: typeof p.email === 'string' ? p.email : '', purchase: p };
}

// A cancelled subscription (subscription_cancelled_at) keeps access until the paid period ends;
// Gumroad then sets subscription_ended_at, which is what revokes access.
export function inactiveReason(p) {
    if (p.refunded) return 'refunded';
    if (p.chargebacked) return 'chargebacked';
    if (p.disputed && !p.dispute_won) return 'disputed';
    if (p.subscription_ended_at) return 'subscription_ended';
    if (p.subscription_failed_at) return 'subscription_payment_failed';
    return null;
}

export const REASON_MESSAGES = {
    invalid_license: "That license key wasn't recognised. Check the key in your Gumroad receipt email and try again.",
    refunded: 'This purchase was refunded, so the license is no longer active.',
    chargebacked: 'This purchase was charged back, so the license is no longer active.',
    disputed: 'This purchase is under dispute, so the license is paused.',
    subscription_ended: 'Your NeuralHive Pro subscription has ended. Renew it on Gumroad to continue.',
    subscription_payment_failed: "Your last NeuralHive Pro payment failed. Update your payment method on Gumroad to continue.",
};
