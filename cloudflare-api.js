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

async function checkResponse(res, defaultErrMsg) {
    if (res.status === 401) {
        // 토큰이 진짜 만료된 경우에만 세션 파괴
        const token = localStorage.getItem('andre_youth_admin_token');
        if (token) {
            localStorage.removeItem('andre_youth_admin_token');
            localStorage.removeItem('adminUser');
            localStorage.removeItem('andre_admin_last_activity');
        }
        // 관리자 페이지에서만 리다이렉트 (일반 페이지에서는 조용히 실패)
        if (window.location.pathname.includes('admin')) {
            alert('보안 인증 세션이 만료되었습니다. 다시 로그인해 주세요.');
            window.location.href = 'index.html';
        }
        throw new Error('401 Unauthorized: 세션이 만료되었습니다.');
    }
    if (!res.ok) {
        let errMsg = defaultErrMsg;
        try {
            const errJson = await res.json();
            if (errJson && errJson.error) errMsg += ` (${errJson.error})`;
        } catch(e) {}
        throw new Error(errMsg);
    }
    return await res.json();
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
    async refreshToken() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/users/refresh-token`, {
            method: 'POST',
            headers: getAuthHeaders()
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
    // --- File Upload (R2 Proxy with Real-time Progress) ---
    uploadFile(filename, fileBlob, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `${CF_CONFIG.WORKER_URL}/upload?filename=${encodeURIComponent(filename)}`;
            
            xhr.open('PUT', url, true);
            const headers = getAuthHeaders();
            for (const key in headers) {
                xhr.setRequestHeader(key, headers[key]);
            }

            if (xhr.upload && typeof onProgress === 'function') {
                xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                        const percentComplete = Math.round((e.loaded / e.total) * 100);
                        onProgress(percentComplete);
                    }
                };
            }

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch(e) {
                        resolve({ success: true, url: xhr.responseText });
                    }
                } else if (xhr.status === 401) {
                    reject(new Error('인증이 만료되었습니다. 다시 로그인해 주세요.'));
                } else {
                    reject(new Error('파일 업로드에 실패했습니다: ' + xhr.statusText));
                }
            };

            xhr.onerror = function() {
                reject(new Error('네트워크 오류로 파일 업로드에 실패했습니다.'));
            };

            xhr.send(fileBlob);
        });
    },
    // --- Shorts ---
    async getShorts() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts`, { headers: getAuthHeaders() });
        return await checkResponse(res, '쇼츠 목록을 불러오지 못했습니다.');
    },
    async getShortsStats() {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/stats`, { headers: getAuthHeaders() });
        return await checkResponse(res, '쇼츠 통계를 불러오지 못했습니다.');
    },
    async addShorts(data) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data)
        });
        return await checkResponse(res, '쇼츠를 등록하지 못했습니다.');
    },
    async updateShorts(id, data) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data)
        });
        return await checkResponse(res, '쇼츠 정보를 수정하지 못했습니다.');
    },
    async deleteShorts(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to delete shorts');
        return await res.json();
    },
    async viewShorts(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${id}/view`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        return await res.json();
    },
    async shareShorts(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${id}/share`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        return await res.json();
    },
    async likeShorts(id) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${id}/like`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        return await res.json();
    },
    async getShortsComments(shortsId) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${shortsId}/comments`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to fetch comments');
        return await res.json();
    },
    async addShortsComment(shortsId, data) {
        const res = await fetch(`${CF_CONFIG.WORKER_URL}/shorts/${shortsId}/comments`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to add comment');
        return await res.json();
    }
};

window.CloudflareAPI = {
    D1,
    CF_CONFIG
};
