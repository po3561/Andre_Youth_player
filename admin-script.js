$(document).ready(function () {
    // Login Protection: check localStorage first (synchronous guard),
    // then verify Firebase Auth state asynchronously
    function checkAuth() {
        const adminUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
        if (!adminUser || !adminUser.isApproved) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    if (!checkAuth()) return;

    $('#btn-admin-logout').on('click', function () {
        if (confirm('로그아웃 하시겠습니까?')) {
            window.location.href = 'index.html';
        }
    });

    const ensureUserDb = async () => { };

    function loadScriptOnce(src) {
        return new Promise((resolve, reject) => {
            if ([...document.scripts].some(script => script.src === src)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Cloudflare R2 Upload Function
    async function uploadFileToStorage(file, folder) {
        if (!file || !window.CloudflareAPI || !window.CloudflareAPI.D1) return null;
        
        const fileName = `${folder}/${Date.now()}_${file.name}`;
        
        try {
            const result = await window.CloudflareAPI.D1.uploadFile(fileName, file);
            if (result.success && result.url) {
                return result.url;
            }
            throw new Error(result.error || 'Upload failed');
        } catch(err) {
            console.error("R2 Upload Error:", err);
            throw err;
        }
    }

    // User Management Functions
    async function fetchUsers() {
        const $list = $('#admin-user-list').html('<div class="loading-spinner">사용자 목록을 불러오는 중...</div>');
        try {
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                const users = await window.CloudflareAPI.D1.getUsers();
                renderUsers(users);
            }
        } catch(e) {
            $list.html('<div style="color:red;">로드 실패: ' + e.message + '</div>');
        }
    }

    function renderUsers(users) {
        const $list = $('#admin-user-list').empty();
        if (users.length === 0) {
            $list.append('<div class="loading-spinner">등록된 사용자가 없습니다.</div>');
            return;
        }

        // Sort: Pending first
        users.sort((a, b) => (a.isApproved === b.isApproved) ? 0 : a.isApproved ? 1 : -1);

        users.forEach(u => {
            if (u.id === 'admin') return; // 기본 관리자는 숨김
            
            const statusClass = u.isApproved ? 'approved' : 'pending';
            const statusText = u.isApproved ? '승인됨' : '승인 대기';
            const actionBtns = u.isApproved ? '' :
                `<button class="btn-approve" data-id="${u.id}">승인</button>`;

            $list.append(`
                <div class="admin-user-item">
                    <div class="user-info-main">
                        <div class="user-name-row">
                            <span class="user-name">${u.name} (${u.id})</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-top: 4px;">
                            ${u.company ? `🏢 ${u.company}` : ''} 
                            ${u.position ? `💼 ${u.position}` : ''}
                            ${u.phone ? `📱 ${u.phone}` : ''}
                        </div>
                    </div>
                    <div class="user-actions">
                        ${actionBtns}
                        <button class="btn-reject" data-id="${u.id}" style="background: rgba(255,0,0,0.1); border-color: rgba(255,0,0,0.2);">삭제</button>
                    </div>
                </div>
            `);
        });
    }

    $(document).on('click', '.btn-approve', async function () {
        const id = $(this).data('id');
        if (confirm('이 사용자를 승인하시겠습니까?')) {
            try {
                await window.CloudflareAPI.D1.approveUser(id);
                fetchUsers();
            } catch(e) { alert('승인 실패: ' + e.message); }
        }
    });

    $(document).on('click', '.btn-reject', async function () {
        const id = $(this).data('id');
        if (confirm('사용자를 삭제하시겠습니까?')) {
            try {
                await window.CloudflareAPI.D1.deleteUser(id);
                fetchUsers();
            } catch(e) { alert('삭제 실패: ' + e.message); }
        }
    });

    $('#btn-refresh-users').on('click', () => fetchUsers());
    fetchUsers();

    const FALLBACK_COVER = "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=200";
    const state = {
        audioFile: null,
        audioPreview: null,
        image: null,
        generatedLrc: "",
        audioPreviewUrl: null,
        editSongId: null,
        editAudioFile: null,
        editImageFile: null
    };

    fetchSongs();
    loadAppSettings().catch(() => { });


    $(document).on('dragover dragenter drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
    });

    $('.drop-zone').on('dragover dragenter', function () {
        $(this).addClass('active');
    }).on('dragleave dragend drop', function () {
        $(this).removeClass('active');
    });

    $('.drop-zone').on('drop', function (e) {
        const type = $(this).data('type');
        const file = e.originalEvent.dataTransfer.files[0];
        handleFileSelect(type, file, $(this));
    });

    $('.drop-zone').on('click', function (e) {
        if ($(e.target).is('input[type="file"]')) return;
        $(this).find('input[type="file"]').trigger('click');
    });

    $('input[type="file"]').on('change', function () {
        const type = $(this).parent().data('type');
        const file = this.files[0];
        handleFileSelect(type, file, $(this).parent());
    });

    function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function formatTime(seconds) {
        const safeSeconds = Math.max(0, seconds);
        const totalMs = Math.round(safeSeconds * 1000);
        const mm = Math.floor(totalMs / 60000).toString().padStart(2, '0');
        const ss = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '0');
        const cs = Math.floor((totalMs % 1000) / 10).toString().padStart(2, '0');
        return `[${mm}:${ss}.${cs}]`;
    }

    function normalizeCoverUrl(url) {
        if (!url) return FALLBACK_COVER;
        return MusicEngine.fixUrl(url, 'image');
    }

    function normalizeAudioUrl(url) {
        if (!url) return '';
        return MusicEngine.fixUrl(url, 'audio');
    }

    function formatSignedSeconds(seconds) {
        const safe = Number.isFinite(seconds) ? seconds : 0;
        const sign = safe > 0 ? '+' : '';
        return `${sign}${safe.toFixed(2)}s`;
    }

    function updateBackendStatus(online, message) {
        if (!$backendStatus.length) return;
        $backendStatus
            .toggleClass('is-online', online === true)
            .toggleClass('is-offline', online === false)
            .text(message || '');
    }


    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
            reader.onerror = error => reject(error);
        });
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = error => reject(error);
        });
    }


    function readNumber($input, fallback) {
        const value = Number.parseFloat($input.val());
        return Number.isFinite(value) ? value : fallback;
    }

    function toTitleLabel(file) {
        return `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    }

    function clearAudioPreview() {
        if (state.audioPreviewUrl) {
            URL.revokeObjectURL(state.audioPreviewUrl);
            state.audioPreviewUrl = null;
        }
        if (state.audioPreview) {
            if (typeof state.audioPreview.pause === 'function') {
                state.audioPreview.pause();
            }
            state.audioPreview.src = '';
            state.audioPreview = null;
        }
    }

    function handleFileSelect(type, file, $zone) {
        if (!file) return;

        if (type === 'edit-audio') {
            if (!file.type.startsWith('audio/')) {
                alert('음원 파일만 선택 가능합니다.');
                return;
            }
            state.editAudioFile = file;
            $zone.find('.file-info').text(toTitleLabel(file)).css('opacity', '1');
            $zone.find('p').text('파일 선택됨').css('color', '#00ff88');
            return;
        }

        if (type === 'edit-image') {
            if (!file.type.startsWith('image/')) {
                alert('이미지 파일만 선택 가능합니다.');
                return;
            }
            state.editImageFile = file;
            $zone.find('.file-info').text(toTitleLabel(file)).css('opacity', '1');
            $zone.find('p').text('파일 선택됨').css('color', '#00ff88');
            return;
        }

        if (type === 'audio' && !file.type.startsWith('audio/')) {
            alert('음원 파일만 선택 가능합니다.');
            return;
        }
        if (type === 'image' && !file.type.startsWith('image/')) {
            alert('이미지 파일만 선택 가능합니다.');
            return;
        }


        if (type === 'audio') {
            state.audioFile = file;
        } else {
            state.image = file;
        }
        $zone.find('.file-info').text(toTitleLabel(file)).css('opacity', '1');
        $zone.find('p').text('파일 선택됨').css('color', '#00ff88');

        if (type === 'audio') {
            clearAudioPreview();
            state.audioPreviewUrl = URL.createObjectURL(file);
            state.audioPreview = new Audio(state.audioPreviewUrl);
            state.audioPreview.preload = 'metadata';
        }
    }

    function mixDownToMono(audioBuffer) {
        const { numberOfChannels, length } = audioBuffer;
        const mono = new Float32Array(length);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const source = audioBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                mono[i] += source[i];
            }
        }
        const scale = numberOfChannels > 0 ? 1 / numberOfChannels : 1;
        for (let i = 0; i < length; i++) {
            mono[i] *= scale;
        }
        return mono;
    }

    function smoothSeries(values, radius) {
        const result = new Float32Array(values.length);
        for (let i = 0; i < values.length; i++) {
            let sum = 0;
            let count = 0;
            for (let offset = -radius; offset <= radius; offset++) {
                const idx = i + offset;
                if (idx < 0 || idx >= values.length) continue;
                sum += values[idx];
                count++;
            }
            result[i] = count > 0 ? sum / count : values[i];
        }
        return result;
    }

    function percentile(sortedValues, fraction) {
        if (!sortedValues.length) return 0;
        const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * fraction)));
        return sortedValues[index];
    }

    async function buildEnvelope(audioBuffer, onProgress) {
        const sampleRate = audioBuffer.sampleRate;
        const mono = mixDownToMono(audioBuffer);
        const hopSize = Math.max(512, Math.round(sampleRate * 0.02));
        const windowSize = Math.max(hopSize * 3, Math.round(sampleRate * 0.06));
        const frameCount = Math.max(1, Math.ceil(Math.max(0, mono.length - windowSize) / hopSize) + 1);
        const envelope = new Float32Array(frameCount);
        let frame = 0;

        for (let start = 0; start < mono.length; start += hopSize) {
            const end = Math.min(start + windowSize, mono.length);
            let sum = 0;
            for (let i = start; i < end; i++) {
                const sample = mono[i];
                sum += sample * sample;
            }
            envelope[frame] = Math.sqrt(sum / Math.max(1, end - start));
            frame++;

            if (frame % 800 === 0) {
                onProgress(frame / frameCount);
                await nextFrame();
            }
        }

        onProgress(1);
        return {
            envelope: smoothSeries(envelope, 2),
            hopSize
        };
    }

    function detectActiveRegion(envelope, hopSize, sampleRate, duration) {
        const sorted = Array.from(envelope).sort((a, b) => a - b);
        const noiseFloor = percentile(sorted, 0.2);
        const highLevel = percentile(sorted, 0.92);
        const threshold = noiseFloor + (highLevel - noiseFloor) * 0.18;

        let startFrame = 0;
        while (startFrame < envelope.length && envelope[startFrame] <= threshold) {
            startFrame++;
        }

        let endFrame = envelope.length - 1;
        while (endFrame >= 0 && envelope[endFrame] <= threshold) {
            endFrame--;
        }

        if (startFrame >= endFrame) {
            return { startSec: 0, endSec: duration, threshold };
        }

        const startSec = clamp((startFrame * hopSize) / sampleRate - 0.35, 0, duration);
        const endSec = clamp((endFrame * hopSize) / sampleRate + 0.65, 0, duration);
        return {
            startSec: Math.min(startSec, Math.max(0, duration - 0.5)),
            endSec: Math.max(endSec, Math.min(duration, 0.5)),
            threshold
        };
    }

    function detectPeaks(envelope, hopSize, sampleRate, activeStartSec, activeEndSec) {
        const diffs = new Float32Array(envelope.length);
        for (let i = 1; i < envelope.length; i++) {
            diffs[i] = Math.max(0, envelope[i] - envelope[i - 1]);
        }

        const envSorted = Array.from(envelope).sort((a, b) => a - b);
        const diffSorted = Array.from(diffs).sort((a, b) => a - b);
        const envThreshold = percentile(envSorted, 0.78);
        const diffThreshold = percentile(diffSorted, 0.82);
        const candidates = [];

        for (let i = 1; i < envelope.length - 1; i++) {
            const time = (i * hopSize) / sampleRate;
            if (time < activeStartSec || time > activeEndSec) continue;

            const localMax = envelope[i] >= envelope[i - 1] && envelope[i] > envelope[i + 1];
            if (!localMax) continue;
            if (envelope[i] < envThreshold && diffs[i] < diffThreshold) continue;

            const energy = envelope[i];
            const attack = diffs[i];
            candidates.push({
                time,
                energy,
                attack,
                score: energy * 1.6 + attack * 2.4
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        const selected = [];
        const minGap = 0.18;

        for (const candidate of candidates) {
            const hasNearbyPeak = selected.some(peak => Math.abs(peak.time - candidate.time) < minGap);
            if (!hasNearbyPeak) selected.push(candidate);
        }

        selected.sort((a, b) => a.time - b.time);
        return selected;
    }

    function parseLyricDraft(rawText) {
        const lines = String(rawText || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        const timeReg = /^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]\s*/;
        const entries = lines.map(line => {
            const times = [];
            let rest = line;

            while (true) {
                const match = timeReg.exec(rest);
                if (!match) break;
                times.push(parseInt(match[1], 10) * 60 + parseFloat(match[2]));
                rest = rest.slice(match[0].length);
            }

            return {
                text: rest.trim(),
                time: times.length ? times[times.length - 1] : null,
                hasTimestamp: times.length > 0
            };
        }).filter(entry => entry.text);

        return {
            entries,
            hasSeedTimes: entries.some(entry => Number.isFinite(entry.time))
        };
    }

    function snapTimeToPeak(candidateTime, peaks, searchWindow) {
        let snappedTime = candidateTime;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const peak of peaks) {
            const distance = Math.abs(peak.time - candidateTime);
            if (distance > searchWindow) continue;
            const score = distance - peak.energy * 0.08 - peak.attack * 0.05;
            if (score < bestScore) {
                bestScore = score;
                snappedTime = peak.time;
            }
        }

        return snappedTime;
    }

    function findNearestPeak(candidateTime, peaks, searchWindow) {
        let bestPeak = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const peak of peaks) {
            const distance = Math.abs(peak.time - candidateTime);
            if (distance > searchWindow) continue;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPeak = peak;
            }
        }

        return bestPeak;
    }

    function scoreOffsetCandidate(entries, peaks, startSec, endSec, offsetSec) {
        const seedEntries = entries.filter(entry => Number.isFinite(entry.time));
        if (!seedEntries.length || !peaks.length) return Number.POSITIVE_INFINITY;

        const range = Math.max(0.1, endSec - startSec);
        const searchWindow = clamp(Math.max(0.24, range / Math.max(seedEntries.length * 3, 8)), 0.24, 1.1);
        let score = 0;
        let matched = 0;
        let previousPeakTime = -Infinity;

        for (const entry of seedEntries) {
            const shiftedTime = clamp(entry.time + offsetSec, startSec, endSec);
            const peak = findNearestPeak(shiftedTime, peaks, searchWindow);

            if (!peak) {
                score += 1.45;
                continue;
            }

            const distance = Math.abs(peak.time - shiftedTime);
            score += distance / searchWindow;
            score -= peak.energy * 0.03 + peak.attack * 0.015;

            if (peak.time < previousPeakTime) {
                score += 0.35;
            }

            previousPeakTime = peak.time;
            matched++;
        }

        if (!matched) return Number.POSITIVE_INFINITY;
        return score / matched + (seedEntries.length - matched) * 0.25;
    }

    function estimateBestOffset(entries, peaks, startSec, endSec) {
        const seedEntries = entries.filter(entry => Number.isFinite(entry.time));
        if (!seedEntries.length || !peaks.length) return 0;

        const span = Math.min(12, Math.max(4, endSec - startSec));
        let bestOffset = 0;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let offset = -span; offset <= span; offset += 0.25) {
            const score = scoreOffsetCandidate(entries, peaks, startSec, endSec, offset);
            if (score < bestScore) {
                bestScore = score;
                bestOffset = offset;
            }
        }

        const refineStart = bestOffset - 0.6;
        const refineEnd = bestOffset + 0.6;
        for (let offset = refineStart; offset <= refineEnd; offset += 0.02) {
            const score = scoreOffsetCandidate(entries, peaks, startSec, endSec, offset);
            if (score < bestScore) {
                bestScore = score;
                bestOffset = offset;
            }
        }

        return Math.round(bestOffset * 100) / 100;
    }

    function buildSeededTimeline(entries, peaks, startSec, endSec, offsetSec, minGapSec) {
        const duration = Math.max(0.1, endSec - startSec);
        const total = entries.length;
        const averageGap = duration / Math.max(1, total);
        const fallbackGap = clamp(Math.max(minGapSec, averageGap || 0.5), minGapSec, 4);
        const seedIndexes = [];
        const candidateTimes = new Array(total).fill(null);

        entries.forEach((entry, index) => {
            if (Number.isFinite(entry.time)) {
                candidateTimes[index] = clamp(entry.time + offsetSec, startSec, endSec);
                seedIndexes.push(index);
            }
        });

        if (!seedIndexes.length) return null;

        for (let i = 0; i < seedIndexes.length - 1; i++) {
            const left = seedIndexes[i];
            const right = seedIndexes[i + 1];
            const gap = Math.max(fallbackGap, (candidateTimes[right] - candidateTimes[left]) / Math.max(1, right - left));
            for (let j = left + 1; j < right; j++) {
                candidateTimes[j] = candidateTimes[left] + gap * (j - left);
            }
        }

        const firstSeed = seedIndexes[0];
        for (let i = firstSeed - 1; i >= 0; i--) {
            candidateTimes[i] = candidateTimes[i + 1] - fallbackGap;
        }

        const lastSeed = seedIndexes[seedIndexes.length - 1];
        for (let i = lastSeed + 1; i < total; i++) {
            candidateTimes[i] = candidateTimes[i - 1] + fallbackGap;
        }

        const searchWindow = clamp(Math.max(0.22, averageGap * 0.55), 0.22, 0.9);
        const result = [];
        let previousTime = startSec - minGapSec;

        for (let index = 0; index < total; index++) {
            const entry = entries[index];
            const targetTime = candidateTimes[index] ?? (startSec + averageGap * index);
            const snappedTime = snapTimeToPeak(targetTime, peaks, searchWindow);
            let finalTime = targetTime * 0.78 + snappedTime * 0.22;
            finalTime = clamp(finalTime, startSec, endSec);

            if (finalTime < previousTime + minGapSec) {
                finalTime = previousTime + minGapSec;
            }

            const remainingLines = total - index - 1;
            const maxAllowed = endSec - Math.max(remainingLines * minGapSec, 0.05);
            if (finalTime > maxAllowed) {
                finalTime = maxAllowed;
            }

            finalTime = clamp(finalTime, startSec, endSec);
            previousTime = finalTime;
            result.push(`${formatTime(finalTime)} ${entry.text}`);
        }

        return result.join('\n');
    }

    function assignLyricTimestamps(lines, peaks, startSec, endSec, offsetSec, minGapSec) {
        const entries = Array.isArray(lines)
            ? lines.map(line => {
                if (typeof line === 'string') {
                    return { text: line.trim(), time: null, hasTimestamp: false };
                }
                return {
                    text: String(line.text || '').trim(),
                    time: Number.isFinite(line.time) ? line.time : null,
                    hasTimestamp: !!line.hasTimestamp
                };
            }).filter(entry => entry.text)
            : [];

        if (!entries.length) return "";

        if (entries.some(entry => Number.isFinite(entry.time))) {
            const seeded = buildSeededTimeline(entries, peaks, startSec, endSec, offsetSec, minGapSec);
            if (seeded) return seeded;
        }

        const cleanedLines = entries.map(entry => entry.text);
        if (!cleanedLines.length) return "";

        const duration = Math.max(0.1, endSec - startSec);
        const totalWeight = cleanedLines.reduce((sum, line) => {
            const weight = line.replace(/\s+/g, '').length;
            return sum + Math.max(1, weight);
        }, 0);
        const averageGap = duration / cleanedLines.length;
        const searchWindow = clamp(Math.max(0.28, averageGap * 0.85), 0.28, 1.2);
        const result = [];
        let cumulativeWeight = 0;
        let previousTime = startSec - minGapSec;

        for (let index = 0; index < cleanedLines.length; index++) {
            const line = cleanedLines[index];
            const weight = Math.max(1, line.replace(/\s+/g, '').length);
            const midpoint = (cumulativeWeight + weight * 0.5) / totalWeight;
            cumulativeWeight += weight;

            const targetTime = startSec + duration * midpoint;
            const snappedTime = snapTimeToPeak(targetTime, peaks, searchWindow);

            let finalTime = snappedTime * 0.65 + targetTime * 0.35 + offsetSec;
            finalTime = clamp(finalTime, startSec, endSec);

            if (finalTime < previousTime + minGapSec) {
                finalTime = previousTime + minGapSec;
            }

            const remainingLines = cleanedLines.length - index - 1;
            const maxAllowed = endSec - Math.max(remainingLines * minGapSec, 0.05);
            if (finalTime > maxAllowed) {
                finalTime = maxAllowed;
            }

            finalTime = clamp(finalTime, startSec, endSec);
            previousTime = finalTime;
            result.push(`${formatTime(finalTime)} ${line}`);
        }

        return result.join('\n');
    }

    async function requestGeminiOffset(rawText) {
        if (!rawText || !state.audioFile) return null;
        if (state.audioFile.size && state.audioFile.size > 18 * 1024 * 1024) return null;

        try {
            const audioData = await fileToBase64(state.audioFile);
            if (!audioData) return null;

            // gasBridgePost is no longer available since migrating away from GAS.
            // Returning null falls back to the client-side local estimation algorithm.
            return null;
        } catch (error) {
            console.warn('Gemini offset request failed:', error);
        }

        return null;
    }

    async function analyzeLyrics() {
        const rawText = $('#lyrics-raw').val().trim();
        if (!rawText) {
            alert('가사를 먼저 입력해 주세요.');
            return;
        }
        if (!state.audioFile) {
            alert('분석할 오디오 파일을 먼저 선택해 주세요.');
            return;
        }

        const useManualSync = $('#sync-advanced-enable').length > 0 && $('#sync-advanced-enable').is(':checked');
        const manualOffsetSec = readNumber($('#sync-offset'), 0);
        const manualMinGapSec = clamp(readNumber($('#sync-min-gap'), 0.22), 0.12, 1.0);
        const $btn = $('#btn-ai-auto-sync').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> AI 자동 보정 중...');
        const $progressZone = $('#analysis-progress-container').fadeIn();
        const $fill = $('#analysis-fill').css('width', '0%');
        const $percent = $('#analysis-percent').text('0%');
        const $status = $('#analysis-status-text').text('오디오와 가사를 분석하는 중...');
        let audioCtx = null;
        const draft = parseLyricDraft(rawText);
        const geminiOffsetPromise = Promise.resolve(null);

        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            const arrayBuffer = await state.audioFile.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

            $status.text('파형과 가사 기준점을 찾는 중...');
            $percent.text('15%');
            $fill.css('width', '15%');

            const envelopeResult = await buildEnvelope(audioBuffer, progress => {
                const percent = Math.round(15 + progress * 50);
                $percent.text(percent + '%');
                $fill.css('width', percent + '%');
            });

            const duration = audioBuffer.duration;
            const activeRegion = detectActiveRegion(
                envelopeResult.envelope,
                envelopeResult.hopSize,
                audioBuffer.sampleRate,
                duration
            );

            $status.text('피크와 음절 간격을 계산하는 중...');
            $percent.text('70%');
            $fill.css('width', '70%');

            const peaks = detectPeaks(
                envelopeResult.envelope,
                envelopeResult.hopSize,
                audioBuffer.sampleRate,
                activeRegion.startSec,
                activeRegion.endSec
            );

            $status.text('Gemini AI가 오디오 특성과 가사를 대조하는 중...');
            const geminiOffsetPromise = requestGeminiOffset(rawText);
            const geminiOffsetResult = await geminiOffsetPromise;
            const aiOffsetSec = geminiOffsetResult ? Number(geminiOffsetResult.offsetSec) : NaN;
            const autoOffsetSec = draft.hasSeedTimes
                ? (Number.isFinite(aiOffsetSec)
                    ? aiOffsetSec
                    : estimateBestOffset(draft.entries, peaks, activeRegion.startSec, activeRegion.endSec))
                : 0;
            const offsetSec = useManualSync ? manualOffsetSec : autoOffsetSec;
            const minGapSec = useManualSync ? manualMinGapSec : 0.22;

            $status.text(useManualSync
                ? ('수동 오프셋 적용 중... ' + formatSignedSeconds(offsetSec))
                : (geminiOffsetResult
                    ? ('Gemini AI 보정값 적용 중... ' + formatSignedSeconds(offsetSec))
                    : ('자동 오프셋 추정값 적용 중... ' + formatSignedSeconds(offsetSec)))
            );

            const generatedLrc = assignLyricTimestamps(
                draft.entries,
                peaks,
                activeRegion.startSec,
                activeRegion.endSec,
                offsetSec,
                minGapSec
            );

            state.generatedLrc = generatedLrc;
            $('#generated-lrc-preview').text(generatedLrc || '가사 라인이 너무 짧아 타임라인을 만들 수 없습니다.').fadeIn();

            $percent.text('100%');
            $fill.css('width', '100%');
            if (draft.hasSeedTimes) {
                $status.text(useManualSync
                    ? ('수동 오프셋 적용 완료 ' + formatSignedSeconds(offsetSec))
                    : (geminiOffsetResult
                        ? ('Gemini AI 보정 완료 ' + formatSignedSeconds(offsetSec))
                        : ('자동 오프셋 추정 완료 ' + formatSignedSeconds(offsetSec)))
                );
            } else {
                $status.text(useManualSync ? '수동 보정 완료' : 'AI 분석 완료');
            }
            $btn.html('<i class="fa-solid fa-check"></i> 보정 완료').removeClass('premium-sync-btn').addClass('secondary-btn').prop('disabled', false);
        } catch (error) {
            console.error('AI Sync Error:', error);
            alert('분석 실패: ' + error.message);
            $status.text('오류가 발생했습니다');
            $btn.prop('disabled', false).html('<i class="fa-solid fa-bolt"></i> AI 자동 싱크 생성');
        } finally {
            if (audioCtx) {
                await audioCtx.close().catch(() => { });
            }
            $progressZone.show();
        }
    }

    async function analyzeEditLyrics() {
        const rawText = $('#edit-lyrics').val().trim();
        if (!rawText) {
            alert('가사를 먼저 입력해 주세요.');
            return;
        }

        const audioUrl = $('#edit-audio-url').val().trim();
        if (!state.editAudioFile && !audioUrl) {
            alert('오디오 파일이 등록되어 있지 않습니다.');
            return;
        }

        const manualOffsetSec = parseFloat($('#edit-sync-offset').val()) || 0;
        const manualMinGapSec = clamp(parseFloat($('#edit-sync-min-gap').val()) || 0.22, 0.12, 1.0);
        
        const $btn = $('#edit-btn-ai-auto-sync').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> AI 재분석 중...');
        const $progressZone = $('#edit-analysis-progress-container').fadeIn();
        const $fill = $('#edit-analysis-fill').css('width', '0%');
        const $percent = $('#edit-analysis-percent').text('0%');
        const $status = $('#edit-analysis-status-text').text('오디오를 준비하는 중...');
        let audioCtx = null;
        const draft = parseLyricDraft(rawText);

        try {
            let arrayBuffer;
            if (state.editAudioFile) {
                arrayBuffer = await state.editAudioFile.arrayBuffer();
            } else {
                $status.text('기존 오디오 파일을 다운로드하는 중...');
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(audioUrl)}`;
                const response = await fetch(audioUrl.includes('firebasestorage') ? audioUrl : proxyUrl);
                if (!response.ok) throw new Error('오디오 파일을 다운로드할 수 없습니다.');
                arrayBuffer = await response.arrayBuffer();
            }

            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

            $status.text('파형 분석 중...');
            $percent.text('15%');
            $fill.css('width', '15%');

            const envelopeResult = await buildEnvelope(audioBuffer, progress => {
                const percent = Math.round(15 + progress * 50);
                $percent.text(percent + '%');
                $fill.css('width', percent + '%');
            });

            const duration = audioBuffer.duration;
            const activeRegion = detectActiveRegion(
                envelopeResult.envelope,
                envelopeResult.hopSize,
                audioBuffer.sampleRate,
                duration
            );

            const peaks = detectPeaks(
                envelopeResult.envelope,
                envelopeResult.hopSize,
                audioBuffer.sampleRate,
                activeRegion.startSec,
                activeRegion.endSec
            );

            const autoOffsetSec = draft.hasSeedTimes
                ? estimateBestOffset(draft.entries, peaks, activeRegion.startSec, activeRegion.endSec)
                : 0;
            
            // 수동 값이 0이 아닐 때만 사용 (단순화)
            const offsetSec = manualOffsetSec !== 0 ? manualOffsetSec : autoOffsetSec;
            const minGapSec = manualMinGapSec;

            const generatedLrc = assignLyricTimestamps(
                draft.entries,
                peaks,
                activeRegion.startSec,
                activeRegion.endSec,
                offsetSec,
                minGapSec
            );

            $('#edit-lyrics').val(generatedLrc);

            $percent.text('100%');
            $fill.css('width', '100%');
            $status.text('AI 재분석 및 적용 완료');
            $btn.html('<i class="fa-solid fa-check"></i> 적용 완료').removeClass('premium-sync-btn').addClass('secondary-btn').prop('disabled', false);
        } catch (error) {
            console.error('Edit AI Sync Error:', error);
            alert('재분석 실패: ' + error.message);
            $status.text('오류 발생');
            $btn.prop('disabled', false).html('<i class="fa-solid fa-bolt"></i> AI 자동 싱크 재분석');
        } finally {
            if (audioCtx) await audioCtx.close().catch(() => {});
        }
    }

    $(document).on('click', '#btn-ai-auto-sync', analyzeLyrics);
    $(document).on('click', '#edit-btn-ai-auto-sync', analyzeEditLyrics);

    $(document).on('click', '.offset-quick-btn', function () {
        const delta = parseFloat($(this).data('delta'));
        const $input = $('#sync-offset');
        let current = parseFloat($input.val()) || 0;
        $input.val((current + delta).toFixed(2)).trigger('change');

        // If results already exist, re-run mapping to show preview immediately
        if (state.generatedLrc && state.audioFile) {
            analyzeLyrics();
        }
    });

    $('#sync-offset, #sync-min-gap').on('change', function () {
        if (state.generatedLrc && state.audioFile) {
            // Re-analyze with new manual values if preview exists
            analyzeLyrics();
        }
    });

    $('#btn-upload-all').click(async function () {
        const title = $('#song-title').val().trim();
        if (!title) {
            alert('곡 제목을 입력해주세요.');
            return;
        }

        const audioUrlInput = $('#song-audio-url').val().trim();
        const coverUrlInput = $('#song-cover-url').val().trim();

        if (!audioUrlInput && !state.audioFile) {
            alert('음원 파일 또는 음원 URL은 필수 항목입니다.');
            return;
        }

        const $btn = $(this).prop('disabled', true);
        const $progressZone = $('#upload-progress-container').show();
        const $bar = $('#progress-fill').css('width', '0%').css('background', 'linear-gradient(90deg, #00ff88, #21ccf9)');
        const $percent = $('#progress-percent').text('0%');
        const $status = $('#upload-status-text').text('파일 읽기 및 변환 중...');

        const updateProgress = (p, text) => {
            $bar.css('width', p + '%');
            $percent.text(p + '%');
            if (text) $status.text(text);
        };

        try {
            const artistInput = $('#song-artist').val() || '';
            const defaultArtistInput = $('#setting-default-artist').val() || '';
            const artist = artistInput.trim() || defaultArtistInput.trim() || 'Andre Youth';

            let finalAudioUrl = audioUrlInput;
            if (!finalAudioUrl && state.audioFile) {
                updateProgress(30, '음원 업로드 중 (Cloudflare R2)...');
                finalAudioUrl = await uploadFileToStorage(state.audioFile, 'audio');
            }

            let finalCoverUrl = coverUrlInput;
            if (!finalCoverUrl && state.image) {
                updateProgress(50, '커버 업로드 중 (Cloudflare R2)...');
                finalCoverUrl = await uploadFileToStorage(state.image, 'covers');
            }

            const skipAi = $('#sync-skip-ai').is(':checked');
            const rawLyrics = $('#lyrics-raw').val().trim();
            let finalLyrics = '';

            if (!skipAi && state.generatedLrc) {
                finalLyrics = state.generatedLrc;
            } else if (rawLyrics) {
                finalLyrics = rawLyrics;
            }

            const songId = 'song_' + Date.now().toString(36);

            const newSong = {
                id: songId,
                title,
                artist,
                audio: finalAudioUrl || '',
                cover: finalCoverUrl || FALLBACK_COVER,
                lyricsData: finalLyrics,
                syncOffset: readNumber($('#sync-offset'), 0),
                syncMinGap: readNumber($('#sync-min-gap'), 0.22)
            };

            updateProgress(70, 'Cloudflare에 저장 중...');
            
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                await window.CloudflareAPI.D1.addSong(newSong);
            } else {
                throw new Error("Cloudflare API is not ready.");
            }

            updateProgress(100, '성공! 최신 목록으로 이동합니다.');
            $bar.css('background', '#00ff88');
            setTimeout(() => location.href = 'index.html?sync=true', 1500);
        } catch (error) {
            console.error("Upload Error:", error);
            $bar.css('width', '100%').css('background', '#ff3b30');
            $status.text('업로드 실패: ' + error.message);
            $btn.prop('disabled', false);
        } finally {
            $progressZone.show();
        }
    });

    async function fetchSongs() {
        const $list = $('#admin-song-list');
        $list.html('<div class="loading-spinner">목록 불러오는 중...</div>');

        try {
            let data = [];
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                data = await window.CloudflareAPI.D1.getPlaylist();
            } else {
                throw new Error("Cloudflare API is not ready.");
            }
            
            $list.empty();

            if (!Array.isArray(data) || data.length === 0) {
                $list.append('<div class="loading-spinner">등록된 곡이 없습니다.</div>');
                return;
            }

            data.forEach(song => {
                const songKey = song.id ?? song.key ?? song.title ?? '';
                const $item = $('<div>').addClass('admin-song-item').attr('data-song-key', songKey);
                const $info = $('<div>').addClass('admin-song-info');
                const coverSrc = normalizeCoverUrl(song.cover || song.coverUrl || '');
                const $img = $('<img>')
                    .addClass('song-cover-thumb')
                    .attr('src', coverSrc || FALLBACK_COVER)
                    .attr('alt', `${song.title || '곡'} 커버`);

                $img.on('error', function () {
                    if (this.src !== FALLBACK_COVER) {
                        this.src = FALLBACK_COVER;
                    }
                });

                const audioStr = (typeof song.audio === 'string' && song.audio.trim()) ? song.audio : '';
                const currentAudioUrl = audioStr || song.audioUrl || song.url || '';
                const isDrive = currentAudioUrl.includes('drive.google.com') || currentAudioUrl.includes('docs.google.com') || currentAudioUrl.includes('uc?id=');
                const isR2 = currentAudioUrl.includes('pub-6f09ba73beba48419076ff845f6d3731.r2.dev') || currentAudioUrl.includes('r2.dev');
                
                let badgeHtml = '';
                if (isDrive) {
                    badgeHtml = '<span class="migration-badge badge-drive">⚠️ Drive 이주 필요</span>';
                } else if (isR2) {
                    badgeHtml = '<span class="migration-badge badge-r2">✅ R2 안전함</span>';
                }

                const $titleWrapper = $('<div>').css({display: 'flex', flexDirection: 'column', alignItems: 'flex-start'});
                $titleWrapper.append($('<strong>').text(song.title || '제목 없음'));
                if (badgeHtml) {
                    $titleWrapper.append($(badgeHtml));
                }

                $info.append($img, $titleWrapper);

                const $editButton = $('<button>')
                    .addClass('btn-edit-song')
                    .attr('type', 'button')
                    .attr('aria-label', '수정')
                    .data('song', song)
                    .html('<i class="fa-solid fa-pen-to-square"></i>');

                const $deleteButton = $('<button>')
                    .addClass('btn-delete-song')
                    .attr('type', 'button')
                    .attr('aria-label', '삭제')
                    .data('song', song)
                    .html('<i class="fa-solid fa-trash-can"></i>');

                const $actions = $('<div>').addClass('admin-song-actions');
                $actions.append($editButton, $deleteButton);
                $item.append($info, $actions);
                $list.append($item);
            });

        } catch (error) {
            console.error("fetchSongs error:", error);
            $list.html('<div class="loading-spinner" style="color:#ff3b30;">목록 로드 실패</div>');
        }
    }

    $('#btn-refresh-list').click(fetchSongs);
    $('#btn-refresh-inquiries').click(initInquiryManager);

    async function initInquiryManager() {
        const $list = $('#inquiry-list').empty();
        $list.append('<div class="loading-spinner">문의 목록 가져오는 중...</div>');
        try {
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                const inquiries = await window.CloudflareAPI.D1.getInquiries();
                $list.empty();
                if (!inquiries.length) return $list.append('<div>문의 내역이 없습니다.</div>');
                inquiries.forEach(item => {
                    const $item = $('<div>').addClass('inquiry-item');
                    $item.append(`<strong>${item.name || '익명'}</strong> <small>${item.created_at || ''}</small><p>${item.message || ''}</p>`);
                    const $del = $('<button>').text('삭제').click(async () => {
                        await window.CloudflareAPI.D1.deleteInquiry(item.id);
                        initInquiryManager();
                    });
                    $item.append($del);
                    $list.append($item);
                });
            }
        } catch(e) {
            $list.html('로드 실패: ' + e.message);
        }
    }

    $('#btn-reset-default').click(async function () {
        if (!confirm('현재 플레이리스트를 삭제하고 초기 기본 곡 목록으로 재설정하시겠습니까?')) return;

        const $btn = $(this).prop('disabled', true).text('초기화 중...');

        try {
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                await window.CloudflareAPI.D1.reset();
            }
            localStorage.removeItem('andreYouthPlaylistCache_v8');
            alert('초기 곡 목록으로 재설정되었습니다!');
            fetchSongs();
        } catch (error) {
            alert('초기화 실패: ' + error.message);
        } finally {
            $btn.prop('disabled', false).html('<i class="fa-solid fa-arrows-rotate"></i> 초기화');
        }
    });

    let cachedSettings = {};

    function readSettingsForm() {
        return {
            title: ($('#setting-playlist-title').val() || '').trim(),
            subtitle: ($('#setting-playlist-subtitle').val() || '').trim(),
            popupEnabled: $('#setting-popup-enabled').is(':checked'),
            popupImageUrl: $('#setting-popup-url').val() || ''
        };
    }

    function writeSettingsForm(settings) {
        settings = settings || {};
        $('#setting-playlist-title').val(settings.title || '');
        $('#setting-playlist-subtitle').val(settings.subtitle || '');
        $('#setting-popup-enabled').prop('checked', !!settings.popupEnabled);
        
        if (settings.popupImageUrl) {
            $('#setting-popup-url').val(settings.popupImageUrl);
            $('#setting-popup-preview').attr('src', settings.popupImageUrl).show();
        } else {
            $('#setting-popup-url').val('');
            $('#setting-popup-preview').attr('src', '').hide();
        }
    }

    // 팝업 이미지 미리보기 (로컬)
    let popupImageFile = null;
    $('#setting-popup-file').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        popupImageFile = file;
        const reader = new FileReader();
        reader.onload = function(ev) {
            $('#setting-popup-preview').attr('src', ev.target.result).show();
        };
        reader.readAsDataURL(file);
    });

    async function loadAppSettings() {
        const $status = $('#settings-status').text('설정을 불러오는 중...');
        try {
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                const settings = await window.CloudflareAPI.D1.getSettings();
                writeSettingsForm({ 
                    title: settings.mainTitle || '', 
                    subtitle: settings.subTitle || '',
                    popupEnabled: settings.popupEnabled,
                    popupImageUrl: settings.popupImageUrl
                });
                $status.text('설정을 불러왔습니다.');
            }
        } catch (e) {
            $status.text('설정 불러오기 실패: ' + e.message);
        }
    }

    async function saveAppSettings() {
        const $status = $('#settings-status').text('저장 중...');
        const $btn = $('#btn-save-settings').prop('disabled', true);
        try {
            let popupUrl = $('#setting-popup-url').val();
            
            // 새 파일이 선택되었다면 R2 업로드
            if (popupImageFile) {
                $status.text('팝업 이미지 R2 서버에 업로드 중...');
                popupUrl = await uploadFileToStorage(popupImageFile, 'popups');
                $('#setting-popup-url').val(popupUrl);
                popupImageFile = null; // 초기화
                $('#setting-popup-file').val('');
            }

            const data = readSettingsForm();
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                await window.CloudflareAPI.D1.saveSettings({ 
                    mainTitle: data.title, 
                    subTitle: data.subtitle,
                    popupEnabled: data.popupEnabled,
                    popupImageUrl: data.popupImageUrl
                });
                $status.text('설정 저장 완료. 플레이어 새로고침 시 반영됩니다.');
            }
        } catch (e) {
            $status.text('설정 저장 실패: ' + e.message);
        } finally {
            $btn.prop('disabled', false);
        }
    }

    $('#btn-load-settings').on('click', loadAppSettings);
    $('#btn-save-settings').on('click', saveAppSettings);

    function renderPublicSnapshotFallback() {
        if (!PUBLIC_PLAYLIST.length) return;

        const $list = $('#admin-song-list').empty();
        $list.append('<div class="loading-spinner" style="margin-bottom:12px; border-color:rgba(255,255,255,0.18); color:#f6d48d;">공개 Drive 스냅샷만 표시 중입니다. 실제 편집은 GAS 백엔드가 연결되어야 합니다.</div>');

        PUBLIC_PLAYLIST.forEach(song => {
            const $item = $('<div>').addClass('admin-song-item read-only');
            const $info = $('<div>').addClass('admin-song-info');
            const $img = $('<img>')
                .addClass('song-cover-thumb')
                .attr('src', song.cover || song.profile || FALLBACK_COVER)
                .attr('alt', `${song.title || '곡'} 커버`);

            $img.on('error', function () {
                if (this.src !== FALLBACK_COVER) {
                    this.src = FALLBACK_COVER;
                }
            });

            const $meta = $('<div>').addClass('admin-song-meta');
            $meta.append($('<strong>').text(song.title || '제목 없음'));
            $meta.append($('<span>').addClass('admin-song-chip').text('공개 스냅샷'));
            if (song.lyricsData) {
                $meta.append($('<span>').addClass('admin-song-chip').text('가사 포함'));
            }

            const $deleteButton = $('<button>')
                .addClass('btn-delete-song')
                .attr('type', 'button')
                .attr('aria-label', '삭제')
                .prop('disabled', true)
                .attr('title', '공개 스냅샷에서는 삭제할 수 없습니다.')
                .html('<i class="fa-solid fa-trash-can"></i>');

            $info.append($img, $meta);
            $item.append($info, $deleteButton);
            $list.append($item);
        });
    }

    $(document).on('click', '.btn-delete-song', async function () {
        const song = $(this).data('song') || {};
        const label = song.title || song.id || '이 곡';
        if (!confirm(`'${label}' 곡을 정말 삭제할까요?`)) return;

        const $btn = $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

        try {
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                await window.CloudflareAPI.D1.deleteSong(song.id);
            }
            localStorage.removeItem('andreYouthPlaylistCache_v8');
            alert('삭제되었습니다.');
            fetchSongs();
        } catch (error) {
            alert('삭제 실패: ' + error.message);
            $btn.prop('disabled', false).html('<i class="fa-solid fa-trash-can"></i>');
        }
    });





    function openEditModal(song) {
        state.editSongId = song && song.id ? String(song.id) : null;
        state.editAudioFile = null;
        state.editImageFile = null;
        $('#edit-status').text('');
        $('#edit-song-id').text(state.editSongId || '');
        $('#edit-title').val(song ? String(song.title) : '');
        $('#edit-artist').val(song ? String(song.artist) : '');
        $('#edit-audio-url').val(song && (song.audio || song.audioUrl || song.url) ? String(song.audio || song.audioUrl || song.url) : '');
        $('#edit-cover-url').val(song && (song.coverUrl || song.cover) ? String(song.coverUrl || song.cover) : '');
        $('#edit-lyrics').val(song && (song.lyrics || song.lyricsData) ? String(song.lyrics || song.lyricsData) : '');
        $('#edit-sync-offset').val(Number.isFinite(Number(song && song.syncOffset)) ? Number(song.syncOffset) : 0);
        $('#edit-sync-min-gap').val(Number.isFinite(Number(song && song.syncMinGap)) ? Number(song.syncMinGap) : 0.22);
        const editCoverSrc = normalizeCoverUrl((song && (song.coverUrl || song.cover)) ? (song.coverUrl || song.cover) : '');
        $('#edit-cover-preview')
            .off('error')
            .attr('src', editCoverSrc || FALLBACK_COVER)
            .on('error', function () {
                if (this.src !== FALLBACK_COVER) this.src = FALLBACK_COVER;
            });
        $('#edit-overlay').addClass('active').attr('aria-hidden', 'false');

        // Reset edit drop zone labels
        $('#edit-drop-audio .file-info, #edit-drop-image .file-info').text('드래그 또는 클릭').css('opacity', '0.6');
        $('#edit-drop-audio p').text('음원 교체 (선택)').css('color', '#fff');
        $('#edit-drop-image p').text('커버 교체 (선택)').css('color', '#fff');
    }

    function closeEditModal() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        $('#edit-overlay').removeClass('active').attr('aria-hidden', 'true');
        state.editSongId = null;
        state.editAudioFile = null;
        state.editImageFile = null;
    }

    $('#btn-edit-close').on('click', closeEditModal);
    $('#edit-overlay').on('click', function (e) {
        if (e.target === this) closeEditModal();
    });

    $(document).on('click', '.btn-edit-song', function () {
        const song = $(this).data('song') || {};
        if (song.id) {
            openEditModal(song);
        }
    });

    $('#btn-edit-save').on('click', async function () {
        const id = state.editSongId;
        if (!id) return;

        const title = $('#edit-title').val().trim();
        if (!title) {
            alert('곡 제목을 입력해주세요.');
            return;
        }
        const artist = $('#edit-artist').val().trim();

        const $status = $('#edit-status').text('저장 중...');
        const $btn = $(this).prop('disabled', true);

        try {
            let finalAudioUrl = $('#edit-audio-url').val().trim();
            if (state.editAudioFile) {
                $status.text('음원 업로드 중...');
                finalAudioUrl = await uploadFileToStorage(state.editAudioFile, 'audio');
            }

            let finalCoverUrl = $('#edit-cover-url').val().trim();
            if (state.editImageFile) {
                $status.text('커버 업로드 중...');
                finalCoverUrl = await uploadFileToStorage(state.editImageFile, 'covers');
            }

            $status.text('Cloudflare에 저장 중...');
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                const lyricsData = $('#edit-lyrics').val().trim();
                const syncOffset = parseFloat($('#edit-sync-offset').val()) || 0;
                
                await window.CloudflareAPI.D1.updateSong({
                    id: id,
                    title: title,
                    artist: artist,
                    audio: finalAudioUrl,
                    cover: finalCoverUrl,
                    lyricsData: lyricsData,
                    syncOffset: syncOffset
                });
            } else {
                throw new Error("Cloudflare API is not ready.");
            }
            localStorage.removeItem('andreYouthPlaylistCache_v8');

            $status.text('저장 완료!');
            await new Promise(r => setTimeout(r, 600));
            closeEditModal();
            fetchSongs();
        } catch (error) {
            console.error('Update failed:', error);
            $status.text('저장 실패: ' + error.message);
        } finally {
            $btn.prop('disabled', false);
        }
    });

    // --- Inquiry Management (New) ---
    window.initInquiryManager = async function() {
        const $list = $('#inquiry-list');
        if (!$list.length) return;
        $list.html('<p>문의 내역을 불러오는 중...</p>');
        try {
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                const inquiries = await window.CloudflareAPI.D1.getInquiries();
                if (inquiries.length === 0) {
                    $list.html('<p>새로운 문의가 없습니다.</p>');
                    return;
                }
                $list.empty();
                inquiries.forEach(inq => {
                    const dateStr = new Date(inq.timestamp).toLocaleString();
                    const $item = $(`
                        <div class="inquiry-item" style="border-bottom: 1px solid #333; padding: 10px 0;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h4 style="margin:0 0 5px 0;">${inq.title}</h4>
                                <small style="color:#aaa;">${dateStr}</small>
                            </div>
                            <p style="margin:5px 0; font-size:14px;">${inq.content}</p>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <small style="color:#20B2AA;">연락처: ${inq.contact || '없음'}</small>
                                <button class="btn btn-icon btn-delete-inq" data-id="${inq.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `);
                    $list.append($item);
                });

                $('.btn-delete-inq').on('click', async function() {
                    if (!confirm('이 문의를 삭제하시겠습니까?')) return;
                    const id = $(this).data('id');
                    try {
                        await window.CloudflareAPI.D1.deleteInquiry(id);
                        $(this).closest('.inquiry-item').fadeOut(300, function(){ $(this).remove(); });
                    } catch (e) {
                        alert('삭제 실패: ' + e.message);
                    }
                });
            }
        } catch (e) {
            $list.html('<p>문의 내역을 불러오는 데 실패했습니다.</p>');
            console.error(e);
        }
    };
    initInquiryManager();

    // ==========================================
    // 가사 싱크 메이커 (Sync Maker) 로직
    // ==========================================
    let syncLines = [];
    let syncTimes = [];
    let currentSyncIdx = 0;
    const $syncOverlay = $('#sync-maker-overlay');
    const syncAudio = document.getElementById('sync-maker-audio');

    function formatLrcTime(seconds) {
        if (!seconds || isNaN(seconds)) return '';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds - Math.floor(seconds)) * 100);
        return `[${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}]`;
    }

    function renderSyncLines() {
        const $container = $('#sync-maker-lyrics-container').empty();
        syncLines.forEach((line, i) => {
            const timeStr = syncTimes[i] ? formatLrcTime(syncTimes[i]) + ' ' : '';
            const isActive = i === currentSyncIdx;
            const bg = isActive ? 'rgba(32, 178, 170, 0.3)' : 'transparent';
            const color = isActive ? '#20B2AA' : '#fff';
            const fw = isActive ? 'bold' : 'normal';
            
            $container.append(`
                <div id="sync-line-${i}" style="padding:5px; margin:2px 0; border-radius:4px; background:${bg}; color:${color}; font-weight:${fw}; display:flex;">
                    <span style="width:80px; color:#aaa; font-weight:normal; flex-shrink:0;">${timeStr}</span>
                    <span style="flex:1;">${line}</span>
                </div>
            `);
        });

        // 스크롤 이동
        const activeLine = document.getElementById(`sync-line-${currentSyncIdx}`);
        if (activeLine && $container[0]) {
            $container[0].scrollTop = activeLine.offsetTop - $container[0].clientHeight / 2 + 20;
        }
    }

    $('#btn-open-sync-maker').on('click', function() {
        let audioUrl = $('#edit-audio-url').val().trim();
        
        // URL 폴백 변환 로직 (구글 드라이브 등)
        if (audioUrl && !audioUrl.startsWith('blob:') && !audioUrl.startsWith('data:')) {
            let idMatch = audioUrl.match(/id=([a-zA-Z0-9_-]+)/);
            if (!idMatch) {
                const altMatch = audioUrl.match(new RegExp('\\\\/d\\\\/([a-zA-Z0-9_-]+)'));
                if (altMatch) idMatch = altMatch;
            }
            if (idMatch && typeof window.MusicEngine !== 'undefined') {
                const fallbacks = window.MusicEngine.getFallbacks(idMatch[1]);
                if (fallbacks && fallbacks.length > 0) {
                    audioUrl = fallbacks[0];
                }
            } else if (typeof window.MusicEngine !== 'undefined' && window.MusicEngine.fixUrl) {
                audioUrl = window.MusicEngine.fixUrl(audioUrl, 'audio');
            }
        }

        if (state.editAudioFile) {
            syncAudio.src = URL.createObjectURL(state.editAudioFile);
        } else if (audioUrl) {
            syncAudio.src = audioUrl;
        } else {
            console.warn('음원 소스가 없습니다. 오디오 없이 싱크 모달을 엽니다.');
            syncAudio.src = '';
        }

        // 2. 가사 텍스트 추출 (기존 [00:00.00] 태그 걷어내기)
        const rawText = $('#edit-lyrics').val().trim();
        if (!rawText) {
            alert('가사 텍스트를 먼저 입력해주세요.');
            return;
        }
        
        syncLines = rawText.split('\n')
            .map(l => l.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim())
            .filter(l => l.length > 0);
        
        if (syncLines.length === 0) {
            alert('유효한 가사 텍스트가 없습니다.');
            return;
        }

        syncTimes = new Array(syncLines.length).fill(null);
        currentSyncIdx = 0;
        
        renderSyncLines();
        $('#edit-overlay').removeClass('active'); // 부드럽게 기존 모달 숨기기
        $syncOverlay.addClass('active').attr('aria-hidden', 'false'); // 새 모달 올리기
    });

    $('#btn-sync-maker-close').on('click', function() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        syncAudio.pause();
        $syncOverlay.removeClass('active').attr('aria-hidden', 'true');
        $('#edit-overlay').addClass('active'); // 기존 모달 복원
    });

    // 탭 동작
    function triggerSyncTap() {
        if (currentSyncIdx >= syncLines.length) return;
        syncTimes[currentSyncIdx] = syncAudio.currentTime;
        currentSyncIdx++;
        renderSyncLines();
    }

    $('#btn-sync-maker-tap').on('click', triggerSyncTap);

    // 스페이스바 처리
    $(document).on('keydown', function(e) {
        if ($syncOverlay.hasClass('active') && e.code === 'Space') {
            // 재생 컨트롤러 포커스가 아닐 때만 탭 동작 (기본 스페이스는 재생/정지)
            if (e.target.tagName !== 'AUDIO' && e.target.tagName !== 'BUTTON') {
                e.preventDefault();
                triggerSyncTap();
            }
        }
    });

    // 무르기 동작
    $('#btn-sync-maker-undo').on('click', function() {
        if (currentSyncIdx > 0) {
            currentSyncIdx--;
            syncTimes[currentSyncIdx] = null;
            renderSyncLines();
        }
    });

    // 완성 및 적용
    $('#btn-sync-maker-apply').on('click', function() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        syncAudio.pause();
        const resultLrc = syncLines.map((line, i) => {
            const t = syncTimes[i] ? formatLrcTime(syncTimes[i]) : '';
            return t + line;
        }).join('\n');
        
        $('#edit-lyrics').val(resultLrc);
        $syncOverlay.removeClass('active').attr('aria-hidden', 'true');
        $('#edit-overlay').addClass('active'); // 기존 모달 복원
        
        // 자동 저장 트리거
        if (confirm('가사 텍스트에 싱크가 성공적으로 적용되었습니다! 곧바로 곡 정보를 서버에 저장하시겠습니까?')) {
            $('#btn-edit-save').click();
        }
    });
});
