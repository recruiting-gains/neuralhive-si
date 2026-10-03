import { route, json, readJson, requireBindings, cleanString, HttpError } from '../../_lib/http.js';
import { requireSession } from '../../_lib/auth.js';
import { getTemplate } from '../../_lib/templates.js';
import { listAgents, saveAgents, MAX_AGENTS } from '../../_lib/agents.js';

// GET  /api/agents -> { agents, max }
// POST /api/agents { name, template, instructions } -> 201 { agent }
export const onRequest = route({
    GET: async (context) => {
        requireBindings(context.env, ['NH_KV']);
        const { lid } = await requireSession(context);
        return json({ agents: await listAgents(context.env.NH_KV, lid), max: MAX_AGENTS });
    },
    POST: async (context) => {
        requireBindings(context.env, ['NH_KV']);
        const { lid } = await requireSession(context);
        const body = await readJson(context.request);
        const name = cleanString(body.name, 'name', { min: 1, max: 60 });
        const templateId = typeof body.template === 'string' ? body.template.trim().toLowerCase() : '';
        const template = getTemplate(templateId);
        if (!template) {
            throw new HttpError(400, 'Choose a template: recruiting, support, sales, dev, data, marketing, or custom.', 'validation_error', { field: 'template' });
        }
        const instructions = cleanString(body.instructions, 'instructions', {
            min: templateId === 'custom' ? 10 : 0,
            max: 2000,
            required: templateId === 'custom',
        });

        const kv = context.env.NH_KV;
        const agents = await listAgents(kv, lid);
        if (agents.length >= MAX_AGENTS) {
            throw new HttpError(409, `You've reached the limit of ${MAX_AGENTS} agents. Delete one to create another.`, 'agent_limit_reached', { max: MAX_AGENTS });
        }
        const agent = { id: crypto.randomUUID(), name, template: template.id, instructions, created: new Date().toISOString() };
        agents.push(agent);
        await saveAgents(kv, lid, agents);
        return json({ agent }, 201);
    },
});
