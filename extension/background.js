const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';
let offscreenDocumentPath = 'offscreen.html';

// Helper to get the configured API URL, with a fallback to the default.
async function getApiUrl() {
    const result = await chrome.storage.sync.get('apiUrl');
    return result.apiUrl || DEFAULT_API_URL;
}

// In-memory session key. This is an CryptoKey object.
let sessionCryptoKey = null;
let cachedDecryptedCredentials = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target === 'offscreen') {
        return;
    }

    const actions = {
        'login': (req, res) => handleLogin(req.username, req.password, res),
        'unlock': (req, res) => handleUnlock(req.password, res),
        'get_session_status': (req, res) => handleGetSessionStatus(res),
        'get_cached_credentials': (req, res) => res({ credentials: cachedDecryptedCredentials }),
        'logout': handleLogout,
        'get_credentials_for_url': (req, res) => handleGetCredentialsForUrl(req.url, res),
        'get_mfa_for_url': (req, res) => handleGetMfaForUrl(req.url, res),
        'initiate_fill': (req) => handleInitiateFill(req.credential),
        'get_totp': (req, res) => handleGetTotp(req.credentialId, res),
        'sync_now': (req, res) => syncWithServer(res),
        'scan-qr-code': (req) => handleScanQRCode(req)
    };

    const action = actions[request.type] || actions[request.message];
    if (action) {
        action(request, sendResponse);
        return true;
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('sync_alarm', { periodInMinutes: 15 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'sync_alarm') {
        syncWithServer(); // This sync is silent, no sendResponse
    }
});

async function handleGetSessionStatus(sendResponse) {
    const token = await getToken();
    sendResponse({
        isUnlocked: !!sessionCryptoKey,
        isLoggedIn: !!token
    });
}

async function handleLogin(username, password, sendResponse) {
    const apiUrl = await getApiUrl();
    try {
        const response = await fetch(`${apiUrl}/token/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            await chrome.storage.local.set({ token: data.access });
            await setSessionKey(password);
            const credentials = await fetchAllCredentials(data.access);
            await updateLocalVault(credentials);
            sendResponse({ success: true });
            return;
        }
    } catch (error) {
        console.log("Online login failed, attempting offline unlock.", error.message);
    }

    try {
        console.log("Attempting offline unlock...");
        const result = await chrome.storage.local.get('encrypted_vault');
        if (result.encrypted_vault) {
            await setSessionKey(password);
            const decrypted = await decryptVault(result.encrypted_vault);
            cachedDecryptedCredentials = decrypted;
            sendResponse({ success: true, mode: 'offline' });
        } else {
            sendResponse({ success: false, error: 'Offline, and no local data found.' });
        }
    } catch (e) {
        sessionCryptoKey = null;
        cachedDecryptedCredentials = [];
        sendResponse({ success: false, error: 'Invalid password.' });
    }
}

async function handleUnlock(password, sendResponse) {
    try {
        await setSessionKey(password);
        const result = await chrome.storage.local.get('encrypted_vault');
        if (result.encrypted_vault) {
            const decrypted = await decryptVault(result.encrypted_vault);
            cachedDecryptedCredentials = decrypted;
            sendResponse({ success: true });
            syncWithServer(); // Fire-and-forget sync
        } else {
            throw new Error("No local vault found.");
        }
    } catch (error) {
        sessionCryptoKey = null;
        cachedDecryptedCredentials = [];
        sendResponse({ success: false, error: 'Invalid password or corrupted vault.' });
    }
}

function handleLogout() {
    sessionCryptoKey = null;
    cachedDecryptedCredentials = [];
    chrome.storage.local.remove(['token']);
}

function handleGetCredentialsForUrl(url, sendResponse) {
    if (!sessionCryptoKey) {
        sendResponse({ credentials: [] });
        return;
    }
    const matchingCreds = filterCredentialsByUrl(cachedDecryptedCredentials, url);
    sendResponse({ credentials: matchingCreds });
}

async function handleGetMfaForUrl(url, sendResponse) {
    if (!sessionCryptoKey) {
        sendResponse({ error: 'Vault is locked.' });
        return;
    }
    const matchingCreds = filterCredentialsByUrl(cachedDecryptedCredentials, url);
    const mfaCredential = matchingCreds.find(cred => cred.has_mfa);

    if (mfaCredential) {
        handleGetTotp(mfaCredential.id, sendResponse);
    } else {
        sendResponse({ error: 'No matching credential with MFA found' });
    }
}

async function handleGetTotp(credentialId, sendResponse) {
    const token = await getToken();
    if (!token) {
        sendResponse({ error: 'Not logged in' });
        return;
    }
    const apiUrl = await getApiUrl();
    try {
        const response = await fetch(`${apiUrl}/credentials/${credentialId}/totp/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch TOTP');
        const data = await response.json();
        sendResponse(data);
    } catch (error) {
        sendResponse({ error: error.message });
    }
}

function handleInitiateFill(credential) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
                message: 'fill_credential',
                credential: credential
            });
        }
    });
}

async function syncWithServer(sendResponse) {
    const token = await getToken();
    if (!token || !sessionCryptoKey) {
        if (sendResponse) sendResponse({ success: false, error: 'Not logged in or vault locked.' });
        return;
    }

    try {
        const credentials = await fetchAllCredentials(token);
        await updateLocalVault(credentials);
        if (sendResponse) sendResponse({ success: true });
        // Also notify popup if it's open
        chrome.runtime.sendMessage({ message: 'sync_status', status: 'Sync complete!', error: false }).catch(e => {});
    } catch (error) {
        console.error("Sync failed:", error);
        const errorMessage = error.message || 'Unknown error';
        if (sendResponse) sendResponse({ success: false, error: errorMessage });
        chrome.runtime.sendMessage({ message: 'sync_status', status: `Sync failed: ${errorMessage}`, error: true }).catch(e => {});
    }
}


async function setSessionKey(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    sessionCryptoKey = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function updateLocalVault(credentials) {
    if (!sessionCryptoKey) return;
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(credentials));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, sessionCryptoKey, data);
    
    const encryptedVault = {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encryptedData))
    };

    await chrome.storage.local.set({ encrypted_vault: encryptedVault });
    cachedDecryptedCredentials = credentials;
}

async function decryptVault(encryptedVault) {
    const iv = new Uint8Array(encryptedVault.iv);
    const data = new Uint8Array(encryptedVault.data);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, sessionCryptoKey, data);
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decrypted);
    return JSON.parse(jsonString);
}

function getToken() {
    return new Promise(resolve => {
        chrome.storage.local.get(['token'], result => resolve(result.token));
    });
}

async function fetchAllCredentials(token) {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/credentials/`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch credentials');
    return await response.json();
}

function filterCredentialsByUrl(credentials, url) {
    return credentials.filter(cred => {
        try {
            const pageUrl = new URL(url.startsWith('http') ? url : `http://${url}`);
            const savedUrl = new URL(cred.website_url.startsWith('http') ? cred.website_url : `http://${cred.website_url}`);
            const pageHost = pageUrl.host;
            const savedHost = savedUrl.host;
            const pageHostname = pageUrl.hostname;
            const savedHostname = savedUrl.hostname;
            if (pageHost === savedHost) return true;
            if (pageUrl.port === savedUrl.port && pageHostname.endsWith(`.${savedHostname}`)) return true;
            return false;
        } catch (e) {
            const cleanPageUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '');
            const cleanSavedUrl = cred.website_url.replace(/^(https?:\/\/)?(www\.)?/, '');
            return cleanPageUrl.startsWith(cleanSavedUrl);
        }
    });
}

// --- Offscreen Document Logic ---

async function handleScanQRCode(request) {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'scan-qr-code',
        data: request.data
    });
}

async function hasOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(offscreenDocumentPath)]
    });
    return existingContexts.length > 0;
}

async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) {
        return;
    }

    await chrome.offscreen.createDocument({
        url: offscreenDocumentPath,
        reasons: ['BLOBS'],
        justification: 'QR code scanning requires a canvas to process image data.',
    });
}
