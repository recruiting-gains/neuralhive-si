// Prompt + output normalisation for the free landing-page preview.

export const PREVIEW_SYSTEM = `You are NeuralHive, a super intelligence (SI) that designs AI teammates ("agents").
Given a user's description of the teammate they want, reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"name": "<short memorable agent name, max 4 words>",
 "role": "<one sentence describing what this teammate does>",
 "tasks": ["<example task 1>", "<example task 2>", "<example task 3>"],
 "first_reply": "<the agent's friendly first message to the user, 2-4 sentences, introducing itself and proposing a first step>"}
Each task is one concrete sentence. Never claim the agent has already taken actions in external tools.
If the request is harmful or illegal, design a safe, helpful alternative instead.`;

function str(v, max) {
    return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '';
}

export function normalisePlan(obj) {
    if (!obj) return null;
    const tasks = (Array.isArray(obj.tasks) ? obj.tasks : [])
        .map((t) => str(typeof t === 'object' && t ? t.task || t.description || '' : t, 200))
        .filter(Boolean)
        .slice(0, 3);
    const plan = {
        name: str(obj.name, 60) || 'Your SI Teammate',
        role: str(obj.role, 240),
        tasks,
        first_reply: str(obj.first_reply || obj.sample_reply || obj.firstReply, 1200),
    };
    if (!plan.role || plan.tasks.length === 0 || !plan.first_reply) return null;
    return plan;
}

