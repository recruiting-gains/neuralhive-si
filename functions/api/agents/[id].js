import { route, json, requireBindings, HttpError } from '../../_lib/http.js';
import { requireSession } from '../../_lib/auth.js';
import { listAgents, saveAgents, deleteHistory, assertAgentId } from '../../_lib/agents.js';

// DELETE /api/agents/:id -> { ok: true } (also deletes the agent's chat history)
export const onRequest = route({
    DELETE: async (context) => {
        requireBindings(context.env, ['NH_KV']);
        const { lid } = await requireSession(context);
        const id = assertAgentId(context.params.id);
        const kv = context.env.NH_KV;
        const agents = await listAgents(kv, lid);
        const next = agents.filter((a) => a.id !== id);
        if (next.length === agents.length) throw new HttpError(404, 'That agent was not found. It may have been deleted.', 'agent_not_found');
        await saveAgents(kv, lid, next);
        await deleteHistory(kv, lid, id);
        return json({ ok: true });
    },
});
