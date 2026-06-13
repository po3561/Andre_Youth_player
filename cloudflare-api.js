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
