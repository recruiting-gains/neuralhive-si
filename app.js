// NeuralHive app: license activation, agents and chat.
// All user/model text is rendered with textContent (never innerHTML).
(() => {
    'use strict';

    const TOKEN_KEY = 'nh_session';
    const LICENSE_RE = /^[A-Za-z0-9-]{8,64}$/;

    const FALLBACK_TEMPLATES = [
        { id: 'recruiting', name: 'Recruiting Agent', category: 'HR & Talent', description: 'Automates resume screening, schedules interviews, and updates spreadsheets.' },
        { id: 'support', name: 'Support Agent', category: 'Customer Success', description: 'Handles FAQs, resolves tickets, and escalates complex issues to humans.' },
        { id: 'sales', name: 'Sales Agent', category: 'Revenue Growth', description: 'Personalizes outreach emails, enriches leads, and logs activity in CRM.' },
        { id: 'dev', name: 'Dev Agent', category: 'Engineering', description: 'Reviews pull requests, fixes linting errors, and suggests improvements.' },
        { id: 'data', name: 'Data Agent', category: 'Analytics', description: 'Generates SQL queries, creates visualizations, and summarizes trends.' },
        { id: 'marketing', name: 'Marketing Agent', category: 'Growth', description: 'Drafts posts, analyzes engagement, and schedules content across platforms.' },
        { id: 'custom', name: 'Custom Agent', category: 'Custom', description: 'Your own SI teammate, defined entirely by your instructions.' },
    ];
    const TILE = { recruiting: ['R', 'tile-gold'], support: ['C', 'tile-amber'], sales: ['S', 'tile-orange'], dev: ['D', 'tile-gold'], data: ['A', 'tile-amber'], marketing: ['M', 'tile-orange'], custom: [null, 'tile-amber'] };
    const STARTERS = {
        recruiting: ['Write a job description for a senior backend engineer', 'Create a resume scorecard for a sales manager role', 'Draft a friendly interview scheduling email'],
        support: ['Reply to a customer whose order arrived damaged', 'Turn our refund policy into an FAQ article', 'Write a macro for password reset requests'],
        sales: ['Write a 3-step cold email sequence for HR software', 'Give me discovery questions for a first call', 'Handle the objection "we already have a vendor"'],
        dev: ['Review this function for bugs and security issues', 'Explain how to fix "Cannot read properties of undefined"', 'Write unit tests for a date-parsing helper'],
        data: ['Write SQL for monthly active users by plan', 'Which chart should I use to show churn by cohort?', 'Summarize these numbers for an exec update'],
        marketing: ['Plan a 2-week LinkedIn content calendar', 'Write 3 X posts announcing a product launch', 'Draft a launch email with a clear CTA'],
        custom: ['What can you help me with?', 'Suggest a plan for my first week with you', 'Ask me 3 questions to understand my goals'],
    };

    const $ = (id) => document.getElementById(id);
    const el = {
        viewLoading: $('viewLoading'), viewLogin: $('viewLogin'), viewApp: $('viewApp'),
        logoutBtn: $('logoutBtn'),
        loginForm: $('loginForm'), licenseInput: $('licenseInput'), activateBtn: $('activateBtn'), loginMessage: $('loginMessage'),
        agentsPane: $('agentsPane'), mainPane: $('mainPane'), agentList: $('agentList'), agentListEmpty: $('agentListEmpty'),
        agentCount: $('agentCount'), accountEmail: $('accountEmail'), newAgentBtn: $('newAgentBtn'), usageNote: $('usageNote'),
        panelEmpty: $('panelEmpty'), quickTemplates: $('quickTemplates'),
        panelCreate: $('panelCreate'), createForm: $('createForm'), agentTemplate: $('agentTemplate'), templateDesc: $('templateDesc'),
        agentName: $('agentName'), agentInstructions: $('agentInstructions'), instructionsLabel: $('instructionsLabel'),
        instructionsCount: $('instructionsCount'), createMessage: $('createMessage'), cancelCreateBtn: $('cancelCreateBtn'), createAgentBtn: $('createAgentBtn'),
        panelChat: $('panelChat'), chatTile: $('chatTile'), chatAgentName: $('chatAgentName'), chatAgentMeta: $('chatAgentMeta'),
        deleteAgentBtn: $('deleteAgentBtn'), messages: $('messages'), chatForm: $('chatForm'), chatInput: $('chatInput'),
        sendBtn: $('sendBtn'), chatMessage: $('chatMessage'),
    };

    const state = {
        token: null,
        email: '',
        templates: FALLBACK_TEMPLATES,
        agents: [],
        maxAgents: 20,
        currentId: null,
        panel: 'empty', // empty | create | chat
        mobileMain: false,
        history: {}, // agentId -> messages
        sending: false,
        remaining: null,
        dailyLimit: 200,
    };

    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

    // ---------- storage ----------
    function loadToken() {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    }
    function saveToken(t) {
        try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
    }

    // ---------- API ----------
    class ApiError extends Error {
        constructor(message, status, code) { super(message); this.status = status; this.code = code; }
    }

    async function api(path, { method = 'GET', body } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
        let res;
        try {
            res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
        } catch {
            throw new ApiError('Network error. Check your connection and try again.', 0, 'network_error');
        }
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (!res.ok) {
            const message = (data && typeof data.error === 'string' && data.error) || `Request failed (HTTP ${res.status}).`;
            const err = new ApiError(message, res.status, data && data.code);
            if ((res.status === 401 || res.status === 402) && state.token && path !== '/api/activate') {
                signOutLocal(message, res.status === 402 ? 'error' : 'info');
            }
            throw err;
        }
        return data || {};
    }

    // ---------- small UI helpers ----------
    function showNote(node, text, type) {
        node.classList.remove('hidden', 'msg-success', 'msg-error', 'bg-white/5', 'text-gray-300', 'border', 'border-white/10');
        if (type === 'success') node.classList.add('msg-success');
        else if (type === 'error') node.classList.add('msg-error');
        else node.classList.add('bg-white/5', 'text-gray-300', 'border', 'border-white/10');
        node.textContent = text;
    }
    function hideNote(node) { node.classList.add('hidden'); node.textContent = ''; }
    function setBusy(btn, busy, busyText, idleText) {
        btn.disabled = busy;
        btn.textContent = busy ? busyText : idleText;
    }
    function templateById(id) {
        return state.templates.find((t) => t.id === id) || FALLBACK_TEMPLATES.find((t) => t.id === id) || FALLBACK_TEMPLATES[6];
    }
    function tileFor(agent) {
        const [letter, cls] = TILE[agent.template] || TILE.custom;
        return { letter: letter || (agent.name || '?').trim().charAt(0).toUpperCase() || '?', cls };
    }
    function makeTile(agent, size = 'w-9 h-9') {
        const t = tileFor(agent);
        const d = document.createElement('div');
        d.className = `${size} rounded-lg flex items-center justify-center font-bold flex-none ${t.cls}`;
        d.textContent = t.letter;
        d.setAttribute('aria-hidden', 'true');
        return d;
    }

    function showView(name) {
        el.viewLoading.classList.toggle('hidden', name !== 'loading');
        el.viewLogin.classList.toggle('hidden', name !== 'login');
        el.viewApp.classList.toggle('hidden', name !== 'app');
        el.logoutBtn.classList.toggle('hidden', name !== 'app');
    }

    // ---------- auth ----------
    function signOutLocal(message, type = 'info') {
        state.token = null;
        state.agents = [];
        state.history = {};
        state.currentId = null;
        saveToken(null);
        showView('login');
        if (message) showNote(el.loginMessage, message, type);
    }

    el.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = el.licenseInput.value.trim();
        if (!key) {
            showNote(el.loginMessage, 'Enter your license key to continue.', 'error');
            el.licenseInput.focus();
            return;
        }
        if (!LICENSE_RE.test(key)) {
            showNote(el.loginMessage, 'That does not look like a license key. Copy it exactly from your Gumroad receipt email.', 'error');
            el.licenseInput.focus();
            return;
        }
        hideNote(el.loginMessage);
        setBusy(el.activateBtn, true, 'Activating…', 'Activate');
        try {
            const data = await api('/api/activate', { method: 'POST', body: { license_key: key } });
            state.token = data.token;
            saveToken(data.token);
            el.licenseInput.value = '';
            await loadApp();
        } catch (err) {
            showNote(el.loginMessage, err.message, 'error');
        } finally {
            setBusy(el.activateBtn, false, 'Activating…', 'Activate');
        }
    });

    el.logoutBtn.addEventListener('click', async () => {
        try { await api('/api/logout', { method: 'POST', body: {} }); } catch { /* ignore */ }
        signOutLocal("You've been logged out.", 'info');
    });

    // ---------- loading ----------
    async function loadTemplates() {
        try {
            const data = await api('/api/templates');
            if (Array.isArray(data.templates) && data.templates.length) state.templates = data.templates;
        } catch { /* use fallback list */ }
        renderTemplateOptions();
    }

    async function loadApp() {
        showView('loading');
        try {
            const [session, agents] = await Promise.all([api('/api/session'), api('/api/agents'), loadTemplates()]);
            state.email = session.email || '';
            if (session.limits) {
                state.remaining = session.limits.messages_remaining_today;
                state.dailyLimit = session.limits.messages_per_day || state.dailyLimit;
            }
            state.agents = Array.isArray(agents.agents) ? agents.agents : [];
            state.maxAgents = agents.max || 20;
            showView('app');
            if (state.agents.length && isDesktop()) {
                await openChat(state.agents[0].id);
            } else {
                state.panel = 'empty';
                state.mobileMain = false;
                render();
            }
        } catch (err) {
            if (err.status === 401 || err.status === 402) return; // already signed out with a message
            showView('login');
            showNote(el.loginMessage, `Couldn't load your workspace: ${err.message}`, 'error');
        }
    }

    // ---------- rendering ----------
    function render() {
        // Agent list
        el.agentCount.textContent = `${state.agents.length}/${state.maxAgents}`;
        el.accountEmail.textContent = state.email ? `Signed in as ${state.email}` : '';
        el.newAgentBtn.disabled = state.agents.length >= state.maxAgents;
        el.newAgentBtn.classList.toggle('opacity-60', state.agents.length >= state.maxAgents);
        el.agentList.replaceChildren(...state.agents.map(renderAgentItem));
        el.agentListEmpty.classList.toggle('hidden', state.agents.length > 0);
        el.usageNote.textContent = typeof state.remaining === 'number' ? `${state.remaining} of ${state.dailyLimit} messages left today.` : '';

        // Main panel
        const panel = state.panel;
        el.panelEmpty.classList.toggle('hidden', panel !== 'empty');
        el.panelCreate.classList.toggle('hidden', panel !== 'create');
        el.panelChat.classList.toggle('hidden', panel !== 'chat');
        el.panelChat.classList.toggle('flex', panel === 'chat');

        // Mobile: show either the list or the main pane
        const mainMode = state.mobileMain || state.agents.length === 0;
        el.agentsPane.classList.toggle('hidden', mainMode);
        el.mainPane.classList.toggle('hidden', !mainMode);
        el.mainPane.classList.add('lg:block');
    }

    function renderAgentItem(agent) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'agent-item w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left focus-gold';
        btn.setAttribute('aria-current', String(agent.id === state.currentId && state.panel === 'chat'));
        const text = document.createElement('div');
        text.className = 'min-w-0';
        const name = document.createElement('p');
        name.className = 'text-sm font-medium text-gray-100 truncate';
        name.textContent = agent.name;
        const meta = document.createElement('p');
        meta.className = 'text-xs text-gray-400 truncate';
        meta.textContent = templateById(agent.template).name;
        text.append(name, meta);
        btn.append(makeTile(agent), text);
        btn.addEventListener('click', () => openChat(agent.id));
        li.append(btn);
        return li;
    }

    function renderQuickTemplates() {
        el.quickTemplates.replaceChildren(...state.templates.map((t) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tpl-card rounded-xl p-4 flex gap-3 items-start text-left focus-gold';
            const body = document.createElement('div');
            body.className = 'min-w-0';
            const n = document.createElement('p');
            n.className = 'font-semibold text-gray-100 text-sm';
            n.textContent = t.name;
            const d = document.createElement('p');
            d.className = 'text-xs text-gray-400 mt-1';
            d.textContent = t.description;
            body.append(n, d);
            b.append(makeTile({ template: t.id, name: t.id === 'custom' ? '+' : t.name }), body);
            b.addEventListener('click', () => openCreate(t.id));
            return b;
        }));
    }

    function renderTemplateOptions() {
        const current = el.agentTemplate.value;
        el.agentTemplate.replaceChildren(...state.templates.map((t) => {
            const o = document.createElement('option');
            o.value = t.id;
            o.textContent = t.id === 'custom' ? 'Custom (write your own)' : `${t.name} · ${t.category}`;
            return o;
        }));
        if (current) el.agentTemplate.value = current;
        renderQuickTemplates();
    }

    // ---------- create ----------
    function syncCreateForm(prefillName) {
        const t = templateById(el.agentTemplate.value);
        el.templateDesc.textContent = t.description;
        const custom = t.id === 'custom';
        el.instructionsLabel.replaceChildren(document.createTextNode(custom ? 'Role & instructions ' : 'Extra instructions '));
        const hint = document.createElement('span');
        hint.className = 'text-gray-500 font-normal';
        hint.textContent = custom ? '(required)' : '(optional)';
        el.instructionsLabel.append(hint);
        el.agentInstructions.placeholder = custom
            ? 'Describe the role, goals, tone and rules. e.g., "You are my travel planner. Build day-by-day itineraries on a budget..."'
            : 'Tone, company context, rules, or anything this teammate should always know.';
        if (prefillName) el.agentName.value = custom ? '' : t.name;
    }

    function openCreate(templateId = 'recruiting') {
        if (state.agents.length >= state.maxAgents) {
            state.panel = state.currentId ? 'chat' : 'empty';
            render();
            return;
        }
        el.createForm.reset();
        el.agentTemplate.value = templateId;
        syncCreateForm(true);
        el.instructionsCount.textContent = '0';
        hideNote(el.createMessage);
        state.panel = 'create';
        state.mobileMain = true;
        render();
        el.agentName.focus();
    }

    el.newAgentBtn.addEventListener('click', () => openCreate('recruiting'));
    el.agentTemplate.addEventListener('change', () => syncCreateForm(true));
    el.agentInstructions.addEventListener('input', () => { el.instructionsCount.textContent = String(el.agentInstructions.value.length); });
    el.cancelCreateBtn.addEventListener('click', () => {
        if (state.currentId && state.agents.some((a) => a.id === state.currentId)) {
            state.panel = 'chat';
        } else {
            state.panel = 'empty';
            state.mobileMain = false;
        }
        render();
    });

    el.createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const template = el.agentTemplate.value;
        const name = el.agentName.value.trim();
        const instructions = el.agentInstructions.value.trim();
        if (!name) { showNote(el.createMessage, 'Give your teammate a name.', 'error'); el.agentName.focus(); return; }
        if (template === 'custom' && instructions.length < 10) {
            showNote(el.createMessage, 'Describe what your custom agent should do (at least 10 characters).', 'error');
            el.agentInstructions.focus();
            return;
        }
        hideNote(el.createMessage);
        setBusy(el.createAgentBtn, true, 'Creating…', 'Create agent');
        try {
            const data = await api('/api/agents', { method: 'POST', body: { name, template, instructions } });
            state.agents.push(data.agent);
            state.history[data.agent.id] = [];
            await openChat(data.agent.id);
        } catch (err) {
            if (err.status !== 401 && err.status !== 402) showNote(el.createMessage, err.message, 'error');
        } finally {
            setBusy(el.createAgentBtn, false, 'Creating…', 'Create agent');
        }
    });

    // ---------- chat ----------
    function appendRich(container, text) {
        // Safe rendering: fenced code blocks become <pre><code>, everything else is plain text.
        const re = /```([\w+-]*)\n?([\s\S]*?)```/g;
        let last = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (m.index > last) container.append(document.createTextNode(text.slice(last, m.index).replace(/\n+$/, '')));
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = m[2].replace(/\n$/, '');
            pre.append(code);
            container.append(pre);
            last = re.lastIndex;
        }
        if (last < text.length) container.append(document.createTextNode(last ? text.slice(last).replace(/^\n+/, '') : text));
    }

    function bubble(role, content, agent) {
        const row = document.createElement('div');
        row.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
        const wrap = document.createElement('div');
        wrap.className = 'max-w-[88%] sm:max-w-[80%] min-w-0';
        if (role !== 'user' && agent) {
            const label = document.createElement('p');
            label.className = 'text-[11px] text-gray-500 mb-1 ml-1';
            label.textContent = agent.name;
            wrap.append(label);
        }
        const b = document.createElement('div');
        b.className = `msg ${role === 'user' ? 'msg-user rounded-2xl rounded-br-md' : 'msg-assistant rounded-2xl rounded-bl-md'} px-4 py-3 text-sm`;
        appendRich(b, content);
        wrap.append(b);
        row.append(wrap);
        return row;
    }

    function typingRow() {
        const row = document.createElement('div');
        row.className = 'flex justify-start';
        row.id = 'typingRow';
        const b = document.createElement('div');
        b.className = 'msg-assistant rounded-2xl rounded-bl-md px-4 py-3';
        b.setAttribute('aria-label', 'Your teammate is typing');
        const dots = document.createElement('div');
        dots.className = 'typing';
        dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
        b.append(dots);
        row.append(b);
        return row;
    }

    function renderMessages() {
        const agent = state.agents.find((a) => a.id === state.currentId);
        if (!agent) return;
        const list = state.history[agent.id] || [];
        const nodes = [];
        if (!list.length) {
            const t = templateById(agent.template);
            nodes.push(bubble('assistant', `Hi! I'm ${agent.name}, your ${t.name.replace(/ Agent$/, '').toLowerCase()} SI teammate. What should we work on first?`, agent));
            const chips = document.createElement('div');
            chips.className = 'flex flex-wrap gap-2 pl-1';
            for (const s of STARTERS[agent.template] || STARTERS.custom) {
                const c = document.createElement('button');
                c.type = 'button';
                c.className = 'text-xs text-gray-300 bg-white/5 border border-white/10 hover:border-honey/40 hover:text-honey-light rounded-full px-3 py-1.5 transition focus-gold text-left';
                c.textContent = s;
                c.addEventListener('click', () => { el.chatInput.value = s; autoGrow(); el.chatInput.focus(); });
                chips.append(c);
            }
            nodes.push(chips);
        }
        for (const m of list) nodes.push(bubble(m.role, m.content, agent));
        if (state.sending) nodes.push(typingRow());
        el.messages.replaceChildren(...nodes);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    async function openChat(id) {
        const agent = state.agents.find((a) => a.id === id);
        if (!agent) return;
        state.currentId = id;
        state.panel = 'chat';
        state.mobileMain = true;
        const t = templateById(agent.template);
        const tile = tileFor(agent);
        el.chatTile.className = `w-9 h-9 rounded-lg flex items-center justify-center font-bold flex-none ${tile.cls}`;
        el.chatTile.textContent = tile.letter;
        el.chatAgentName.textContent = agent.name;
        el.chatAgentMeta.textContent = `${t.name} · ${t.category}`;
        hideNote(el.chatMessage);
        render();
        renderMessages();
        if (!state.history[id]) {
            try {
                const data = await api(`/api/chat?agent_id=${encodeURIComponent(id)}`);
                state.history[id] = Array.isArray(data.messages) ? data.messages : [];
            } catch (err) {
                state.history[id] = [];
                if (err.status !== 401 && err.status !== 402) showNote(el.chatMessage, `Couldn't load history: ${err.message}`, 'error');
            }
            if (state.currentId === id) renderMessages();
        }
        if (isDesktop()) el.chatInput.focus();
    }

    function autoGrow() {
        el.chatInput.style.height = 'auto';
        el.chatInput.style.height = `${Math.min(el.chatInput.scrollHeight, 160)}px`;
    }
    el.chatInput.addEventListener('input', autoGrow);
    el.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            el.chatForm.requestSubmit();
        }
    });

    el.chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const agentId = state.currentId;
        const text = el.chatInput.value.trim();
        if (!text || state.sending || !agentId) return;
        if (text.length > 4000) { showNote(el.chatMessage, 'Messages can be up to 4,000 characters.', 'error'); return; }
        hideNote(el.chatMessage);
        const history = state.history[agentId] || (state.history[agentId] = []);
        const userMsg = { role: 'user', content: text, ts: new Date().toISOString() };
        history.push(userMsg);
        el.chatInput.value = '';
        autoGrow();
        state.sending = true;
        el.sendBtn.disabled = true;
        renderMessages();
        try {
            const data = await api('/api/chat', {
                method: 'POST',
                body: { agent_id: agentId, messages: history.slice(-20).map(({ role, content }) => ({ role, content })) },
            });
            history.push(data.reply);
            if (typeof data.remaining_today === 'number') state.remaining = data.remaining_today;
        } catch (err) {
            const i = history.indexOf(userMsg);
            if (i !== -1) history.splice(i, 1);
            if (err.status !== 401 && err.status !== 402) {
                if (state.currentId === agentId && !el.chatInput.value) { el.chatInput.value = text; autoGrow(); }
                showNote(el.chatMessage, err.message, 'error');
            }
        } finally {
            state.sending = false;
            el.sendBtn.disabled = false;
            if (state.token) { render(); if (state.currentId === agentId) renderMessages(); }
        }
    });

    el.deleteAgentBtn.addEventListener('click', async () => {
        const agent = state.agents.find((a) => a.id === state.currentId);
        if (!agent) return;
        if (!window.confirm(`Delete "${agent.name}" and its chat history? This can't be undone.`)) return;
        el.deleteAgentBtn.disabled = true;
        try {
            await api(`/api/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
            state.agents = state.agents.filter((a) => a.id !== agent.id);
            delete state.history[agent.id];
            state.currentId = null;
            if (state.agents.length && isDesktop()) {
                await openChat(state.agents[0].id);
            } else {
                state.panel = 'empty';
                state.mobileMain = false;
                render();
            }
        } catch (err) {
            if (err.status !== 401 && err.status !== 402) showNote(el.chatMessage, err.message, 'error');
        } finally {
            el.deleteAgentBtn.disabled = false;
        }
    });

    document.querySelectorAll('[data-action="back"]').forEach((b) => b.addEventListener('click', () => {
        state.mobileMain = false;
        if (state.agents.length === 0) state.panel = 'empty';
        render();
    }));

    window.addEventListener('resize', () => { if (state.token && !el.viewApp.classList.contains('hidden')) render(); });

    // ---------- boot ----------
    renderTemplateOptions();
    state.token = loadToken();
    if (state.token && /^[a-f0-9]{64}$/.test(state.token)) {
        loadApp();
    } else {
        saveToken(null);
        state.token = null;
        showView('login');
        loadTemplates();
    }
})();
