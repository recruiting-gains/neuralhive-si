import { HttpError } from './http.js';

export const MAX_AGENTS = 20;
export const MAX_HISTORY = 50;
const ID_RE = /^[a-f0-9-]{36}$/;

export function assertAgentId(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'Invalid agent id.', 'validation_error', { field: 'agent_id' });
    return id;
}

export async function listAgents(kv, lid) {
    try {
        const list = JSON.parse((await kv.get(`agents:${lid}`)) || '[]');
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export async function saveAgents(kv, lid, agents) {
    await kv.put(`agents:${lid}`, JSON.stringify(agents));
}

export async function getAgent(kv, lid, id) {
    const agent = (await listAgents(kv, lid)).find((a) => a.id === id);
    if (!agent) throw new HttpError(404, 'That agent was not found. It may have been deleted.', 'agent_not_found');
    return agent;
}

const historyKey = (lid, id) => `hist:${lid}:${id}`;

export async function getHistory(kv, lid, id) {
    try {
        const h = JSON.parse((await kv.get(historyKey(lid, id))) || '[]');
        return Array.isArray(h) ? h : [];
    } catch {
        return [];
    }
}

export async function saveHistory(kv, lid, id, history) {
    await kv.put(historyKey(lid, id), JSON.stringify(history.slice(-MAX_HISTORY)));
}

export async function deleteHistory(kv, lid, id) {
    await kv.delete(historyKey(lid, id));
}
