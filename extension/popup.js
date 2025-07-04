const API_URL = 'http://127.0.0.1:8000/api';

const loginView = document.getElementById('login-view');
const credentialsView = document.getElementById('credentials-view');
const addCredentialView = document.getElementById('add-credential-view');

const loginForm = document.getElementById('login-form');
const usernameField = document.getElementById('username-field'); // Assuming this div exists
const passwordInput = document.getElementById('password');
const loginButton = document.querySelector('#login-form button');

const addCredentialForm = document.getElementById('add-credential-form');
const credentialsList = document.getElementById('credentials-list');
const logoutBtn = document.getElementById('logout-btn');
const addNewBtn = document.getElementById('add-new-btn');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const syncBtn = document.getElementById('sync-btn'); // Assuming a sync button exists

const loginError = document.getElementById('login-error');
const addError = document.getElementById('add-error');
const searchBox = document.getElementById('search-box');

let allCredentials = [];

// --- Initialization ---

// Main function to determine popup state
function initializePopup() {
    chrome.runtime.sendMessage({ message: 'is_key_set' }, (response) => {
        if (response && response.status) {
            // Key is set, vault is unlocked
            showCredentialsView();
            loadCredentialsFromCache();
        } else {
            // Key is not set, check if a vault exists to be unlocked
            chrome.storage.local.get('encrypted_vault', (result) => {
                if (result.encrypted_vault) {
                    // Vault exists, but is locked
                    showUnlockView();
                } else {
                    // No vault, user needs to log in for the first time
                    showLoginView();
                }
            });
        }
    });
}

initializePopup();

// --- Event Listeners ---

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    loginError.textContent = '';

    // Check if we are in "unlock" or "login" mode
    const isUnlockMode = usernameField.style.display === 'none';

    if (isUnlockMode) {
        chrome.runtime.sendMessage({ message: 'unlock', password }, (response) => {
            if (response && response.success) {
                initializePopup();
            } else {
                loginError.textContent = 'Invalid password.';
            }
        });
    } else {
        const username = document.getElementById('username').value;
        chrome.runtime.sendMessage({ message: 'login', username, password }, (response) => {
            if (response && response.success) {
                initializePopup();
            } else {
                loginError.textContent = 'Invalid username or password.';
            }
        });
    }
});

logoutBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ message: 'logout' });
    showLoginView();
});

if (syncBtn) {
    syncBtn.addEventListener('click', () => {
        syncBtn.textContent = 'Syncing...';
        chrome.runtime.sendMessage({ message: 'sync_now' }, () => {
            // Re-load credentials from cache after sync
            loadCredentialsFromCache();
            syncBtn.textContent = 'Sync Now';
        });
    });
}

searchBox.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredCredentials = allCredentials.filter(cred => 
        cred.website_url.toLowerCase().includes(searchTerm) || 
        cred.username.toLowerCase().includes(searchTerm)
    );
    renderCredentials(filteredCredentials);
});

addNewBtn.addEventListener('click', () => showAddCredentialView());
cancelAddBtn.addEventListener('click', () => showCredentialsView());

addCredentialForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addError.textContent = '';

    const newCredential = {
        website_url: e.target['add-website'].value,
        username: e.target['add-username'].value,
        password: e.target['add-password'].value,
        mfa_secret: e.target['add-mfa'].value || null,
    };

    // Since we now have a local cache, we can add to the server
    // and then trigger a sync to update the local vault.
    chrome.storage.local.get('token', async (result) => {
        if (!result.token) {
            addError.textContent = 'Authentication error. Please log in again.';
            return;
        }
        try {
            const response = await fetch(`${API_URL}/credentials/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${result.token}`
                },
                body: JSON.stringify(newCredential)
            });
            if (!response.ok) throw new Error('Failed to save to server');
            
            // Saved to server, now sync to update local vault
            chrome.runtime.sendMessage({ message: 'sync_now' }, () => {
                addCredentialForm.reset();
                showCredentialsView();
                loadCredentialsFromCache();
            });

        } catch (error) {
            addError.textContent = 'Failed to save credential.';
        }
    });
});


// --- UI and Data Functions ---

function loadCredentialsFromCache() {
    chrome.runtime.sendMessage({ message: 'get_cached_credentials' }, (response) => {
        if (response && response.credentials) {
            allCredentials = response.credentials;
            renderCredentials(allCredentials);
        }
    });
}

function renderCredentials(credentials) {
    credentialsList.innerHTML = '';
    if (!credentials || credentials.length === 0) {
        credentialsList.innerHTML = '<p>No credentials found.</p>';
        return;
    }
    credentials.forEach(cred => {
        const item = document.createElement('div');
        item.className = 'credential-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        const info = document.createElement('div');
        info.style.cursor = 'pointer';
        info.style.flexGrow = '1';
        info.innerHTML = `<strong>${cred.website_url}</strong><br>Username: ${cred.username}`;
        info.addEventListener('click', () => {
            chrome.runtime.sendMessage({ message: 'initiate_fill', credential: cred });
            window.close();
        });
        item.appendChild(info);

        if (cred.has_mfa) {
            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy Code';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                chrome.runtime.sendMessage({ message: 'get_totp', credentialId: cred.id }, (response) => {
                    if (response && response.totp) {
                        navigator.clipboard.writeText(response.totp).then(() => {
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 2000);
                        });
                    }
                });
            });
            item.appendChild(copyBtn);
        }
        credentialsList.appendChild(item);
    });
}

function showLoginView() {
    loginView.style.display = 'block';
    credentialsView.style.display = 'none';
    addCredentialView.style.display = 'none';
    usernameField.style.display = 'block';
    loginButton.textContent = 'Login';
}

function showUnlockView() {
    loginView.style.display = 'block';
    credentialsView.style.display = 'none';
    addCredentialView.style.display = 'none';
    usernameField.style.display = 'none';
    loginButton.textContent = 'Unlock';
}

function showCredentialsView() {
    loginView.style.display = 'none';
    credentialsView.style.display = 'block';
    addCredentialView.style.display = 'none';
}

function showAddCredentialView() {
    loginView.style.display = 'none';
    credentialsView.style.display = 'none';
    addCredentialView.style.display = 'block';
}
