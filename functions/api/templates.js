import { route, json } from '../_lib/http.js';
import { publicTemplates } from '../_lib/templates.js';

// GET /api/templates -> public template list (system prompts stay server-side)
export const onRequest = route({
    GET: async () => json({ templates: publicTemplates() }),
});
