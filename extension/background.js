const API_URL = 'http://127.0.0.1:8000/api';

// In-memory session key. This is an CryptoKey object.
let sessionCryptoKey = null;
let cachedDecryptedCredentials = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'login') {
        handleLogin(request.username, request.password, sendResponse);
    } else if (request.message === 'unlock') {
        handleUnlock(request.password, sendResponse);
    } else if (request.message === 'is_key_set') {
        sendResponse({ status: !!sessionCryptoKey });
    } else if (request.message === 'get_cached_credentials') {
        sendResponse({ credentials: cachedDecryptedCredentials });
    } else if (request.message === 'logout') {
        handleLogout();
    } else if (request.message === 'get_credentials_for_url') {
        handleGetCredentialsForUrl(request.url, sendResponse);
    } else if (request.message === 'get_mfa_for_url') {
        handleGetMfaForUrl(request.url, sendResponse);
    } else if (request.message === 'initiate_fill') {
        handleInitiateFill(request.credential);
    } else if (request.message === 'get_totp') {
        handleGetTotp(request.credentialId, sendResponse);
    } else if (request.message === 'sync_now') {
        syncWithServer();
    }
    return true;
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('sync_alarm', { periodInMinutes: 15 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'sync_alarm') {
        syncWithServer();
    }
});

async function handleLogin(username, password, sendResponse) {
    // --- Online-First Path ---
    try {
        const response = await fetch(`${API_URL}/token/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            // Online login successful
            const data = await response.json();
            await chrome.storage.local.set({ token: data.access });
            await setSessionKey(password);
            const credentials = await fetchAllCredentials(data.access);
            await updateLocalVault(credentials);
            sendResponse({ success: true });
            return;
        }
        // If response is not ok, fall through to offline login
    } catch (error) {
        // Network error, fall through to offline login
        console.log("Online login failed, attempting offline unlock.", error.message);
    }

    // --- Offline Fallback Path ---
    try {
        console.log("Attempting offline unlock...");
        const result = await chrome.storage.local.get('encrypted_vault');
        if (result.encrypted_vault) {
            await setSessionKey(password); // Set key first
            const decrypted = await decryptVault(result.encrypted_vault); // Then try to decrypt
            cachedDecryptedCredentials = decrypted;
            sendResponse({ success: true, mode: 'offline' });
        } else {
            // Offline and no local vault, login is impossible.
            sendResponse({ success: false, error: 'Offline, and no local data found.' });
        }
    } catch (e) {
        // Decryption failed, so password was wrong.
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
            syncWithServer();
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
    // "Logout" now just means locking the vault and clearing the session.
    // The encrypted vault remains for offline login.
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
    try {
        const response = await fetch(`${API_URL}/credentials/${credentialId}/totp/`, {
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

async function syncWithServer() {
    const token = await getToken();
    if (!token || !sessionCryptoKey) return;
    try {
        const credentials = await fetchAllCredentials(token);
        await updateLocalVault(credentials);
    } catch (error) {
        console.error("Sync failed:", error);
    }
}

// --- Web Crypto API Functions ---

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
    
    // Store IV and data together
    const encryptedVault = {
        iv: Array.from(iv), // Convert Uint8Array to array for JSON serialization
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

// --- Helpers ---

function getToken() {
    return new Promise(resolve => {
        chrome.storage.local.get(['token'], result => resolve(result.token));
    });
}

async function fetchAllCredentials(token) {
    const response = await fetch(`${API_URL}/credentials/`, {
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
