const API_URL = 'http://127.0.0.1:8000/api';

const loginView = document.getElementById('login-view');
const credentialsView = document.getElementById('credentials-view');
const addCredentialView = document.getElementById('add-credential-view');

const loginForm = document.getElementById('login-form');
const usernameField = document.getElementById('username-field');
const passwordInput = document.getElementById('password');
const loginButton = document.querySelector('#login-form button');

const addCredentialForm = document.getElementById('add-credential-form');
const credentialsList = document.getElementById('credentials-list');
const logoutBtn = document.getElementById('logout-btn');
const addNewBtn = document.getElementById('add-new-btn');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const syncBtn = document.getElementById('sync-btn');

const loginError = document.getElementById('login-error');
const addError = document.getElementById('add-error');
const searchBox = document.getElementById('search-box');
const scanQrBtn = document.getElementById('scan-qr-btn');
const syncStatus = document.getElementById('sync-status');

let allCredentials = [];
let sessionStatus = { isLoggedIn: false, isUnlocked: false };

// --- UI View Functions ---
function showLoginView(promptForRelogin = false) {
    loginView.style.display = 'block';
    credentialsView.style.display = 'none';
    addCredentialView.style.display = 'none';
    usernameField.style.display = 'block';
    document.getElementById('username').required = true;
    loginButton.textContent = 'Login';
    if (promptForRelogin) {
        loginError.textContent = 'Session expired. Please login again for online features.';
    }
}

function showUnlockView() {
    loginView.style.display = 'block';
    credentialsView.style.display = 'none';
    addCredentialView.style.display = 'none';
    usernameField.style.display = 'none';
    document.getElementById('username').required = false;
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

// --- Data Handling and Rendering ---

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

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';

        const copyPassBtn = document.createElement('button');
        copyPassBtn.textContent = 'Copy Pass';
        copyPassBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(cred.password).then(() => {
                copyPassBtn.textContent = 'Copied!';
                setTimeout(() => { copyPassBtn.textContent = 'Copy Pass'; }, 2000);
            });
        });
        buttonContainer.appendChild(copyPassBtn);

        if (cred.has_mfa) {
            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy Code';
            copyBtn.style.marginLeft = '5px';
            
            // Disable MFA button if not logged in
            if (!sessionStatus.isLoggedIn) {
                copyBtn.disabled = true;
                copyBtn.title = "Please login to use this feature.";
            }

            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyBtn.disabled = true;
                chrome.runtime.sendMessage({ message: 'get_totp', credentialId: cred.id }, (response) => {
                    copyBtn.disabled = false;
                    if (response && response.totp) {
                        navigator.clipboard.writeText(response.totp).then(() => {
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 2000);
                        });
                    } else {
                        copyBtn.textContent = 'Error!';
                        console.error('Failed to get TOTP:', response.error);
                        // If the error is "Not logged in", prompt for re-login
                        if (response.error === 'Not logged in') {
                            showLoginView(true);
                        }
                        setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 2000);
                    }
                });
            });
            buttonContainer.appendChild(copyBtn);
        }
        item.appendChild(buttonContainer);
        credentialsList.appendChild(item);
    });
}

// --- Initialization ---

function initializePopup() {
    chrome.runtime.sendMessage({ message: 'get_session_status' }, (response) => {
        sessionStatus = response;
        syncBtn.disabled = !response.isLoggedIn;
        syncBtn.title = response.isLoggedIn ? "Sync with server" : "Please login to sync";

        if (response.isUnlocked) {
            showCredentialsView();
            loadCredentialsFromCache();
        } else {
            // Check if a vault exists to be unlocked
            chrome.storage.local.get('encrypted_vault', (result) => {
                if (result.encrypted_vault) {
                    showUnlockView();
                } else {
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

    const isUnlockMode = loginButton.textContent === 'Unlock';

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
        syncBtn.disabled = true;
        syncStatus.textContent = 'Syncing...';
        syncStatus.style.color = 'inherit';
        chrome.runtime.sendMessage({ message: 'sync_now' }, (response) => {
            loadCredentialsFromCache();
            syncBtn.disabled = false;
            if (response && response.success) {
                syncStatus.textContent = 'Sync complete!';
                syncStatus.style.color = 'green';
            } else {
                syncStatus.textContent = `Sync failed: ${response.error}`;
                syncStatus.style.color = 'red';
            }
            setTimeout(() => { syncStatus.textContent = ''; }, 5000);
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

scanQrBtn.addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (imageDataUrl) => {
        if (chrome.runtime.lastError) {
            addError.textContent = `Error capturing tab: ${chrome.runtime.lastError.message}`;
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            chrome.runtime.sendMessage({
              target: 'offscreen',
              type: 'scan-qr-code',
              data: imageData
            });
    
            chrome.runtime.onMessage.addListener(function listener(message) {
              if (message.type === 'qr-code-scanned') {
                document.getElementById('add-mfa').value = message.data;
                chrome.runtime.onMessage.removeListener(listener);
              } else if (message.type === 'qr-code-scan-failed') {
                console.error('QR Code scan failed:', message.error);
                addError.textContent = 'Failed to scan QR code. ' + (message.error || '');
                chrome.runtime.onMessage.removeListener(listener);
              }
            });
        };
        img.src = imageDataUrl;
    });
});

addCredentialForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addError.textContent = '';

    const newCredential = {
        website_url: e.target['add-website'].value,
        username: e.target['add-username'].value,
        password: e.target['add-password'].value,
        mfa_secret: e.target['add-mfa'].value || null,
    };

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

// Listen for sync status updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'sync_status') {
        if (syncStatus) {
            syncStatus.textContent = request.status;
            syncStatus.style.color = request.error ? 'red' : 'green';
            setTimeout(() => { syncStatus.textContent = ''; }, 5000);
        }
    }
});
