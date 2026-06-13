const CF_CONFIG = {
    WORKER_URL: 'https://andre-youth-api.ej210651392.workers.dev',
    R2_ACCESS_KEY: 'ebae683f2e3a32547e79bcb1814fde7a',
    R2_SECRET_KEY: '1c515d389757f8fa3db279b2b6fa96da216cba45e151bca75a03bfb1184d21b5',
    R2_ENDPOINT: 'https://81f630d262df1be917412e3888adb133.r2.cloudflarestorage.com',
    R2_BUCKET_NAME: 'ply999'
};

const D1 = {
    async getPlaylist() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist`);
        if (!res.ok) throw new Error('Failed to fetch playlist');
        return await res.json();
    },
    async addSong(song) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(song)
        });
        if (!res.ok) throw new Error('Failed to add song');
        return await res.json();
    },
    async updateSong(song) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(song)
        });
        if (!res.ok) throw new Error('Failed to update song');
        return await res.json();
    },
    async deleteSong(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/playlist/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete song');
        return await res.json();
    },
    async reset() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/reset`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to reset playlist');
        return await res.json();
    },
    async initTable() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/init`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to init table');
        return await res.json();
    },
    // --- Chat ---
    async getChat() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/chat`);
        if (!res.ok) throw new Error('Failed to fetch chat');
        return await res.json();
    },
    async sendChat(messageObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messageObj)
        });
        if (!res.ok) throw new Error('Failed to send chat');
        return await res.json();
    },
    // --- Inquiry ---
    async getInquiries() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/inquiry`);
        if (!res.ok) throw new Error('Failed to fetch inquiries');
        return await res.json();
    },
    async sendInquiry(inquiryObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/inquiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inquiryObj)
        });
        if (!res.ok) throw new Error('Failed to send inquiry');
        return await res.json();
    },
    async deleteInquiry(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/inquiry/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete inquiry');
        return await res.json();
    },
    // --- Settings ---
    async getSettings() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/settings`);
        if (!res.ok) throw new Error('Failed to fetch settings');
        return await res.json();
    },
    async saveSettings(settingsObj) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsObj)
        });
        if (!res.ok) throw new Error('Failed to save settings');
        return await res.json();
    }
};

let s3 = null;
if (typeof AWS !== 'undefined') {
    s3 = new AWS.S3({
        endpoint: new AWS.Endpoint(CF_CONFIG.R2_ENDPOINT),
        accessKeyId: CF_CONFIG.R2_ACCESS_KEY,
        secretAccessKey: CF_CONFIG.R2_SECRET_KEY,
        signatureVersion: 'v4',
        region: 'auto',
        s3ForcePathStyle: true
    });
}

window.CloudflareAPI = {
    D1,
    s3,
    CF_CONFIG
};
