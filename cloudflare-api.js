const CF_CONFIG = {
    WORKER_URL: 'https://andre-youth-api.ej210651392.workers.dev',
    R2_ENDPOINT: 'https://81f630d262df1be917412e3888adb133.r2.cloudflarestorage.com',
    R2_BUCKET_NAME: 'ply999'
};

function getAuthHeaders(extraHeaders = {}) {
    const token = localStorage.getItem('andre_youth_admin_token');
    return {
        ...extraHeaders,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

const D1 = {
    async getPlaylist() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to fetch playlist');
        return await res.json();
    },
    async addSong(song) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(song)
        });
        if (!res.ok) throw new Error('Failed to add song');
        return await res.json();
    },
    async updateSong(song) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(song)
        });
        if (!res.ok) throw new Error('Failed to update song');
        return await res.json();
    },
    async deleteSong(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to delete song');
        return await res.json();
    },
    async reset() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/reset`, { 
            method: 'DELETE',
            headers: getAuthHeaders() 
        });
        if (!res.ok) throw new Error('Failed to reset playlist');
        return await res.json();
    },
    async initTable() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/init`, { 
            method: 'POST',
            headers: getAuthHeaders() 
        });
        if (!res.ok) throw new Error('Failed to init table');
        return await res.json();
    },
    // --- Chat ---
    async getChat() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/chat`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to fetch chat');
        return await res.json();
    },
    async sendChat(messageObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/chat`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(messageObj)
        });
        if (!res.ok) throw new Error('Failed to send chat');
        return await res.json();
    },
    // --- Inquiry ---
    async getInquiries() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/inquiry`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to fetch inquiries');
        return await res.json();
    },
    async sendInquiry(inquiryObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/inquiry`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(inquiryObj)
        });
        if (!res.ok) throw new Error('Failed to send inquiry');
        return await res.json();
    },
    async deleteInquiry(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/inquiry/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to delete inquiry');
        return await res.json();
    },
    // --- Settings ---
    async getSettings() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/settings`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to fetch settings');
        return await res.json();
    },
    async saveSettings(settingsObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/settings`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(settingsObj)
        });
        if (!res.ok) throw new Error('Failed to save settings');
        return await res.json();
    },
    // --- Users ---
    async signup(userObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/users/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userObj)
        });
        return await res.json();
    },
    async login(userObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userObj)
        });
        return await res.json();
    },
    async getUsers() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/users`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to fetch users');
        return await res.json();
    },
    async approveUser(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/users/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ action: 'approve' })
        });
        return await res.json();
    },
    async deleteUser(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/users/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        return await res.json();
    },
    // --- File Upload (R2 Proxy) ---
    async uploadFile(filename, fileBlob) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/upload?filename=${encodeURIComponent(filename)}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: fileBlob
        });
        if (!res.ok) throw new Error('Upload failed');
        return await res.json();
    }
};

window.CloudflareAPI = {
    D1,
    CF_CONFIG
};
