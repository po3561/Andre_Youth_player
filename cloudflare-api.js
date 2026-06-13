const CF_CONFIG = {
    WORKER_URL: 'https://andre-youth-api.ej210651392.workers.dev',
    R2_ACCESS_KEY: '81839cc4b3c3fc7b8c7a5d33377a4268',
    R2_SECRET_KEY: '7b2f3e3a45d7472aaf3b1f03a9c0ae5ce265fe1d581b1e4a0e170a0ccfff4003',
    R2_ENDPOINT: 'https://81f630d262df1be917412e3888adb133.r2.cloudflarestorage.com',
    R2_BUCKET_NAME: 'andre-youth'
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
    }
};

let s3 = null;
if (typeof AWS !== 'undefined') {
    s3 = new AWS.S3({
        endpoint: CF_CONFIG.R2_ENDPOINT,
        accessKeyId: CF_CONFIG.R2_ACCESS_KEY,
        secretAccessKey: CF_CONFIG.R2_SECRET_KEY,
        signatureVersion: 'v4',
        region: 'auto'
    });
}

window.CloudflareAPI = {
    D1,
    s3,
    CF_CONFIG
};
