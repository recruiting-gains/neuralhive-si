document.addEventListener('DOMContentLoaded', () => {
    const createBtn = document.getElementById('createBtn');
    const promptInput = document.getElementById('promptInput');
    const modelPicker = document.getElementById('modelPicker');
    const formMessage = document.getElementById('formMessage');
    const promptBox = document.getElementById('create');

    const DEFAULT_LABEL = 'Create Agent';
    const MESSAGE_STYLES = {
        success: ['msg-success'],
        error: ['msg-error'],
    };
    let messageTimer = null;

    function showMessage(text, type) {
        clearTimeout(messageTimer);
        formMessage.classList.remove(...MESSAGE_STYLES.success, ...MESSAGE_STYLES.error, 'hidden');
        formMessage.classList.add(...MESSAGE_STYLES[type]);
        formMessage.textContent = text;
        messageTimer = setTimeout(hideMessage, 6000);
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

    // Simulated request. In production, replace with a POST to your backend, e.g.
    // return fetch('/api/create-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    function submitAgentRequest(payload) {
        return new Promise((resolve) => setTimeout(() => resolve(payload), 1500));
    }

    createBtn.addEventListener('click', () => {
        const prompt = promptInput.value.trim();
        const model = modelPicker.value;

        if (!prompt) {
            showMessage('Please describe what you want your SI teammate to do.', 'error');
            promptInput.classList.add('input-error');
            promptInput.focus();
            return;
        }

        hideMessage();
        setLoading(true);

        submitAgentRequest({ prompt, model })
            .then(() => {
                promptInput.value = '';
                showMessage("Agent request received - we'll email you when NeuralHive opens.", 'success');
            })
            .catch(() => {
                showMessage('Something went wrong. Please try again.', 'error');
            })
            .finally(() => setLoading(false));
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
