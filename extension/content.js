const usernameSelectors = [
    'input[autocomplete="username"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[name="login_id"]',
    'input#username',
    'input#email',
    'input#userid',
    'input#login',
    'input[type="email"]',
    'input[type="text"]',
    'input[placeholder*="user" i]',
    'input[placeholder*="e-mail" i]',
    'input[placeholder*="login" i]',
    'input[aria-label*="user" i]',
    'input[aria-label*="e-mail" i]',
];

const mfaSelectors = [
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"]',
    'input[pattern="[0-9]*"]',
    'input[name*="otp"]',
    'input[name*="totp"]',
    'input[name*="mfa"]',
    'input[name*="2fa"]',
    'input[name*="code"]',
    'input#otp',
    'input#mfa_code',
    'input[placeholder*="code" i]',
    'input[aria-label*="code" i]',
];

// Listen for messages from the popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'fill_credential') {
        fillLoginForm(request.credential);
        sendResponse({ status: 'success' });
    }
});

// --- Main Execution Logic ---

// 1. Use a single, delegated event listener for showing the credential selector.
// This is more robust for Single Page Applications (SPAs).
document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target.matches(usernameSelectors.join(','))) {
        console.log("Username field focused, requesting credentials.");
        chrome.runtime.sendMessage(
            { message: 'get_credentials_for_url', url: window.location.href },
            (response) => {
                if (response && response.credentials && response.credentials.length > 0) {
                    showCredentialSelector(response.credentials, target);
                }
            }
        );
    }
});


// 2. Handle MFA Auto-fill (decoupled)
const mfaObserver = new MutationObserver((mutations, obs) => {
    const mfaInput = findVisibleInput(mfaSelectors);
    if (mfaInput) {
        obs.disconnect(); // Found it, stop looking
        console.log("MFA input detected. Requesting TOTP from background.");
        chrome.runtime.sendMessage(
            { message: 'get_mfa_for_url', url: window.location.href },
            (response) => {
                if (response && response.totp) {
                    console.log("Filling MFA code and submitting.");
                    const event = new Event('input', { bubbles: true });
                    mfaInput.value = response.totp;
                    mfaInput.dispatchEvent(event);

                    const form = mfaInput.closest('form');
                    if (form) {
                        const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
                        if (submitButton) {
                            submitButton.click();
                        }
                    }
                } else {
                    console.log("No single matching MFA credential found for this URL.");
                }
            }
        );
    }
});

mfaObserver.observe(document.body, {
    childList: true,
    subtree: true
});


// --- Helper Functions ---

function findVisibleInput(selectors, scope = document) {
    for (const selector of selectors) {
        // Use querySelectorAll to check all potential matches
        const elements = scope.querySelectorAll(selector);
        for (const element of elements) {
             if (element && (element.offsetWidth > 0 || element.offsetHeight > 0)) {
                return element;
            }
        }
    }
    return null;
}

function fillLoginForm(credential) {
    const passwordSelectors = ['input[type="password"]', 'input[autocomplete="current-password"]', 'input[name="password"]', 'input#password'];
    const passwordInput = findVisibleInput(passwordSelectors);
    if (!passwordInput) return;

    const form = passwordInput.closest('form');
    const scope = form || document;
    const usernameInput = findVisibleInput(usernameSelectors, scope);

    if (usernameInput && passwordInput) {
        const event = new Event('input', { bubbles: true });
        usernameInput.value = credential.username;
        usernameInput.dispatchEvent(event);
        passwordInput.value = credential.password;
        passwordInput.dispatchEvent(event);
    }
}

function showCredentialSelector(credentials, usernameInput) {
    if (!usernameInput) return;
    const oldSelector = document.getElementById('pm-inline-selector');
    if (oldSelector) oldSelector.remove();

    const selectorContainer = document.createElement('div');
    selectorContainer.id = 'pm-inline-selector';
    const rect = usernameInput.getBoundingClientRect();
    
    selectorContainer.style.cssText = `position: absolute; top: ${window.scrollY + rect.bottom}px; left: ${window.scrollX + rect.left}px; width: ${rect.width}px; z-index: 999999; background-color: white; border: 1px solid #ccc; border-radius: 0 0 4px 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); font-family: sans-serif; max-height: 200px; overflow-y: auto;`;

    let html = '<ul style="list-style:none; margin:0; padding:0;">';
    credentials.forEach((cred, index) => {
        html += `<li data-index="${index}" style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;">${cred.username}</li>`;
    });
    html += '</ul>';
    selectorContainer.innerHTML = html;
    document.body.appendChild(selectorContainer);

    selectorContainer.querySelectorAll('li').forEach((li, index) => {
        li.addEventListener('mouseenter', () => li.style.backgroundColor = '#f0f0f0');
        li.addEventListener('mouseleave', () => li.style.backgroundColor = 'white');
        li.addEventListener('click', () => {
            fillLoginForm(credentials[index]);
            selectorContainer.remove();
        });
    });

    document.addEventListener('click', function closeSelector(event) {
        if (!selectorContainer.contains(event.target) && event.target !== usernameInput) {
            selectorContainer.remove();
            document.removeEventListener('click', closeSelector);
        }
    });
}
