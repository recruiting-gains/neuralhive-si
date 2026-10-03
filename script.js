document.addEventListener('DOMContentLoaded', () => {
    const createBtn = document.getElementById('createBtn');
    const promptInput = document.getElementById('promptInput');
    const modelPicker = document.getElementById('modelPicker');
    const formMessage = document.getElementById('formMessage');
    const previewResult = document.getElementById('previewResult');
    const promptBox = document.getElementById('create');

    const GUMROAD_URL = 'https://launchpad61.gumroad.com/l/xqxyjc';
    const DEFAULT_LABEL = 'Create Agent';
    const MESSAGE_STYLES = {
        success: ['msg-success'],
        error: ['msg-error'],
    };

    function showMessage(text, type) {
        formMessage.classList.remove(...MESSAGE_STYLES.success, ...MESSAGE_STYLES.error, 'hidden');
        formMessage.classList.add(...MESSAGE_STYLES[type]);
        formMessage.textContent = text;
    }

    function hideMessage() {
        formMessage.classList.add('hidden');
        formMessage.textContent = '';
    }

    function setLoading(isLoading) {
        createBtn.disabled = isLoading;
        createBtn.textContent = isLoading ? 'Creating...' : DEFAULT_LABEL;
        createBtn.classList.toggle('opacity-70', isLoading);
        promptInput.classList.remove('input-error');
    }

    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text; // always textContent: model output is never parsed as HTML
        return el;
    }

    function ctaRow(remaining) {
        const row = node('div', 'flex flex-col sm:flex-row gap-3 sm:items-center mt-5');
        const buy = node('a', 'text-center bg-honey text-hive-ink font-semibold py-2.5 px-5 rounded-lg hover:bg-honey-light transition focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-light', 'Get NeuralHive Pro');
        buy.href = GUMROAD_URL;
        buy.target = '_blank';
        buy.rel = 'noopener';
        const app = node('a', 'text-center border border-honey/60 text-honey font-semibold py-2.5 px-5 rounded-lg hover:bg-honey/10 hover:text-honey-light transition focus:outline-none focus-visible:ring-2 focus-visible:ring-honey', 'I have a license');
        app.href = '/app';
        row.append(buy, app);
        if (typeof remaining === 'number') {
            row.append(node('p', 'text-xs text-gray-400 sm:ml-auto', `${remaining} free preview${remaining === 1 ? '' : 's'} left today`));
        }
        return row;
    }

    function renderPlan(plan, remaining) {
        const card = node('div', 'rounded-xl border border-honey/30 bg-hive-bg/60 p-4 sm:p-5');
        const head = node('div', 'flex items-center gap-3 mb-3');
        const tile = node('div', 'w-10 h-10 flex-none rounded-lg bg-honey text-hive-ink font-bold flex items-center justify-center', (plan.name || 'N').trim().charAt(0).toUpperCase());
        tile.setAttribute('aria-hidden', 'true');
        const titles = node('div', 'min-w-0');
        titles.append(node('p', 'text-xs uppercase tracking-wide text-honey-light font-semibold', 'Your SI teammate preview'));
        titles.append(node('h3', 'text-lg font-bold text-gray-100 break-words', plan.name));
        head.append(tile, titles);
        card.append(head);
        card.append(node('p', 'text-sm text-gray-300 mb-4', plan.role));

        card.append(node('p', 'text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2', 'Example tasks'));
        const list = node('ol', 'space-y-2 mb-4');
        (plan.tasks || []).forEach((task, i) => {
            const li = node('li', 'flex gap-3 text-sm text-gray-200');
            li.append(node('span', 'flex-none w-5 h-5 rounded-full bg-honey/15 text-honey-light text-xs font-semibold flex items-center justify-center', String(i + 1)));
            li.append(node('span', '', task));
            list.append(li);
        });
        card.append(list);

        card.append(node('p', 'text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2', 'Sample first reply'));
        card.append(node('p', 'text-sm text-gray-200 whitespace-pre-wrap break-words rounded-xl rounded-bl-md bg-white/[0.04] border border-white/10 px-4 py-3', plan.first_reply));

        card.append(node('p', 'text-sm text-gray-400 mt-5', 'Like it? NeuralHive Pro turns this plan into a working SI teammate you can chat with.'));
        card.append(ctaRow(remaining));
        previewResult.replaceChildren(card);
        previewResult.classList.remove('hidden');
    }

    function renderLimitReached(message) {
        const card = node('div', 'rounded-xl border border-honey/30 bg-hive-bg/60 p-4 sm:p-5');
        card.append(node('p', 'text-sm text-gray-200', message));
        card.append(ctaRow());
        previewResult.replaceChildren(card);
        previewResult.classList.remove('hidden');
    }

    async function requestPreview(prompt, model) {
        let res;
        try {
            res = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ prompt, model }),
                credentials: 'same-origin',
            });
        } catch {
            return { ok: false, status: 0, error: 'Network error. Check your connection and try again.' };
        }
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (res.ok && data && data.plan) return { ok: true, data };
        const error = (data && typeof data.error === 'string' && data.error) || 'The free preview is unavailable right now. Please try again later.';
        return { ok: false, status: res.status, error };
    }

    createBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        const model = modelPicker.value;

        if (!prompt) {
            showMessage('Please describe what you want your SI teammate to do.', 'error');
            promptInput.classList.add('input-error');
            promptInput.focus();
            return;
        }
        if (prompt.length < 10) {
            showMessage('Add a little more detail (at least 10 characters) so NeuralHive can design your teammate.', 'error');
            promptInput.classList.add('input-error');
            promptInput.focus();
            return;
        }

        hideMessage();
        previewResult.classList.add('hidden');
        setLoading(true);
        const result = await requestPreview(prompt, model);
        setLoading(false);

        if (result.ok) {
            renderPlan(result.data.plan, result.data.remaining_today);
        } else if (result.status === 429) {
            renderLimitReached(result.error);
        } else {
            showMessage(result.error, 'error');
        }
    });

    // Ctrl/Cmd + Enter submits from the prompt box
    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !createBtn.disabled) {
            event.preventDefault();
            createBtn.click();
        }
    });

    promptInput.addEventListener('input', () => {
        promptInput.classList.remove('input-error');
    });

    // "Use Template" fills the prompt with the template's description and scrolls to it
    document.querySelectorAll('.use-template').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.closest('.template-card');
            const desc = card ? card.querySelector('.template-desc') : null;
            if (!desc) return;

            promptInput.value = desc.textContent.trim();
            promptInput.classList.remove('input-error');
            hideMessage();
            promptBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            promptInput.focus({ preventScroll: true });
        });
    });
});
