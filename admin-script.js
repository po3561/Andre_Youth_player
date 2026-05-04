$(document).ready(function() {
    // Login Protection
    const adminUser = JSON.parse(localStorage.getItem('adminUser'));
    if (!adminUser || !adminUser.isApproved) {
        $('body').append('<div class="login-protection-overlay">권한이 없습니다. 로그인 후 이용해주세요.</div>');
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        return;
    }

    $('#btn-admin-logout').on('click', function() {
        if (confirm('로그아웃 하시겠습니까?')) {
            localStorage.removeItem('adminUser');
            window.location.href = 'index.html';
        }
    });

    const firebaseConfig = {
        apiKey: "AIzaSyDt1XdEfx760ojnETRw-HYqJQOP8GK5fXE",
        authDomain: "busan-youth-player.firebaseapp.com",
        databaseURL: "https://busan-youth-player-default-rtdb.firebaseio.com",
        projectId: "busan-youth-player",
        storageBucket: "busan-youth-player.firebasestorage.app",
        messagingSenderId: "406016035492",
        appId: "1:406016035492:web:e3d03145aefa945c707431"
    };

    let userDb = null;
    let firebaseLoadPromise = null;

    async function ensureUserDb() {
        if (userDb) return userDb;
        if (!firebaseLoadPromise) {
            firebaseLoadPromise = (async () => {
                if (typeof window.firebase === 'undefined' || typeof window.firebase.database !== 'function') {
                    await loadScriptOnce('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
                    await loadScriptOnce('https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js');
                }
                if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
                return firebase.database();
            })();
        }
        const db = await firebaseLoadPromise;
        userDb = db.ref('users');
        return userDb;
    }

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

    // User Management Functions
    async function fetchUsers() {
        $('#admin-user-list').html('<div class="loading-spinner">사용자 불러오는 중...</div>');
        try {
            await ensureUserDb();
            userDb.on('value', (snapshot) => {
                const users = [];
                snapshot.forEach(child => {
                    users.push({ key: child.key, ...child.val() });
                });
                renderUsers(users);
            });
        } catch (error) {
            console.error('Fetch Users Error:', error);
            $('#admin-user-list').html('<div class="loading-spinner">사용자 목록을 불러오지 못했습니다.</div>');
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
            const statusClass = u.isApproved ? 'approved' : 'pending';
            const statusText = u.isApproved ? '승인됨' : '승인 대기';
            const actionBtns = u.isApproved ? 
                `<button class="btn-reject" data-key="${u.key}">권한 회수</button>` :
                `<button class="btn-approve" data-key="${u.key}">승인</button>`;

            $list.append(`
                <div class="admin-user-item">
                    <div class="user-info-main">
                        <div class="user-name-row">
                            <span class="user-name">${u.name} (${u.id})</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div class="user-details">
                            전화: ${u.phone} | 고유번호: ${u.unique}<br>
                            사명: ${u.company} | 직책: ${u.position}
                        </div>
                    </div>
                    <div class="user-actions">
                        ${actionBtns}
                        <button class="btn-reject" data-key="${u.key}" style="background: rgba(255,0,0,0.1); border-color: rgba(255,0,0,0.2);">삭제</button>
                    </div>
                </div>
            `);
        });
    }

    $(document).on('click', '.btn-approve', async function() {
        const key = $(this).data('key');
        if (confirm('이 사용자를 승인하시겠습니까?')) {
            await userDb.child(key).update({ isApproved: true });
        }
    });

    $(document).on('click', '.btn-reject', async function() {
        const key = $(this).data('key');
        const isDelete = $(this).text() === '삭제';
        if (confirm(isDelete ? '이 사용자를 삭제하시겠습니까?' : '이 사용자의 승인을 취소하시겠습니까?')) {
            if (isDelete) {
                await userDb.child(key).remove();
            } else {
                await userDb.child(key).update({ isApproved: false });
            }
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
    loadAppSettings().catch(() => {});


    $(document).on('dragover dragenter drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });

    $('.drop-zone').on('dragover dragenter', function() {
        $(this).addClass('active');
    }).on('dragleave dragend drop', function() {
        $(this).removeClass('active');
    });

    $('.drop-zone').on('drop', function(e) {
        const type = $(this).data('type');
        const file = e.originalEvent.dataTransfer.files[0];
        handleFileSelect(type, file, $(this));
    });

    $('.drop-zone').on('click', function() {
        $(this).find('input[type="file"]').trigger('click');
    });

    $('input[type="file"]').on('change', function() {
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

            const result = await gasBridgePost({
                action: 'ai-sync',
                title: $('#song-title').val().trim(),
                artist: 'Andre Youth',
                lyricsRaw: rawText,
                audioName: state.audioFile.name,
                audioMime: state.audioFile.type || 'audio/mpeg',
                audioData
            }, { timeoutMs: GAS_BRIDGE_TIMEOUT_MS });

            if (result && result.status === 'success' && Number.isFinite(Number(result.offsetSec))) {
                return result;
            }
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
                await audioCtx.close().catch(() => {});
            }
            $progressZone.show();
        }
    }

    $(document).on('click', '#btn-ai-auto-sync', analyzeLyrics);

    $(document).on('click', '.offset-quick-btn', function() {
        const delta = parseFloat($(this).data('delta'));
        const $input = $('#sync-offset');
        let current = parseFloat($input.val()) || 0;
        $input.val((current + delta).toFixed(2)).trigger('change');
        
        // If results already exist, re-run mapping to show preview immediately
        if (state.generatedLrc && state.audioFile) {
            analyzeLyrics();
        }
    });

    $('#sync-offset, #sync-min-gap').on('change', function() {
        if (state.generatedLrc && state.audioFile) {
            // Re-analyze with new manual values if preview exists
            analyzeLyrics();
        }
    });

    $('#btn-upload-all').click(async function() {
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
            const artist = $('#song-artist').val().trim() || $('#setting-default-artist').val().trim() || 'Andre Youth';

            let finalAudioUrl = audioUrlInput;
            if (!finalAudioUrl && state.audioFile) {
                updateProgress(30, '음원 파일 변환 중...');
                finalAudioUrl = await fileToDataUrl(state.audioFile);
            }

            let finalCoverUrl = coverUrlInput;
            if (!finalCoverUrl && state.image) {
                updateProgress(50, '커버 이미지 변환 중...');
                finalCoverUrl = await fileToDataUrl(state.image);
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
                url: finalAudioUrl || '',
                cover: finalCoverUrl || FALLBACK_COVER,
                lyrics: finalLyrics,
                lyricsData: finalLyrics,
                syncOffset: readNumber($('#sync-offset'), 0),
                syncMinGap: readNumber($('#sync-min-gap'), 0.22)
            };

            updateProgress(70, '파이어베이스에 저장 중...');
            await ensureUserDb();

            const snap = await firebase.database().ref('users/playlist').once('value');
            let rawData = snap.val() || [];
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
                rawData = Object.values(rawData);
            }
            const currentPlaylist = Array.isArray(rawData) ? rawData : [];
            currentPlaylist.push(newSong);

            await firebase.database().ref('users/playlist').set(currentPlaylist);

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
            await ensureUserDb();
            const snap = await firebase.database().ref('users/playlist').once('value');
            let rawData = snap.val() || [];
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
                rawData = Object.values(rawData);
            }
            const data = Array.isArray(rawData) ? rawData : [];

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

                $img.on('error', function() {
                    if (this.src !== FALLBACK_COVER) {
                        this.src = FALLBACK_COVER;
                    }
                });

                $info.append($img, $('<strong>').text(song.title || '제목 없음'));

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

        } catch(error) {
            console.error("fetchSongs error:", error);
            $list.html('<div class="loading-spinner" style="color:#ff3b30;">목록 로드 실패</div>');
        }
    }


    // Google Drive cover URL -> thumbnail URL 정규화
    function normalizeCoverUrl(url) {
        if (!url) return '';
        if (url.includes('drive.google.com/thumbnail')) return url;
        const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
            return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w200`;
        }
        return url;
    }

    $('#btn-refresh-list').click(fetchSongs);

    $('#btn-reset-default').click(async function() {
        if (!confirm('현재 플레이리스트를 삭제하고 초기 기본 곡 목록으로 재설정하시겠습니까?')) return;

        const $btn = $(this).prop('disabled', true).text('초기화 중...');

        try {
            await ensureUserDb();

            const defaultSongs = [
                {
                    "id": "d9baeed0-e2b6-4f3a-9d08-07ef468889c7",
                    "title": "그러므로",
                    "artist": "Andre Youth",
                    "url": "https://drive.google.com/file/d/1zn-BgGJ-pm2WdDsJXS4hUnUxLp18W-NA/view?usp=sharing",
                    "cover": "https://drive.google.com/file/d/1S0e9I0aC25m4bbcnTLVR6OaxIWC-FmfL/view?usp=sharing",
                    "lyrics": "[00:07.00] 오늘 내 눈에 보이지 않고\n[00:07.22] 오늘 내 손에 잡히지 않아도\n[00:14.16] 그의 눈이 날 지켜보셨고\n[00:21.76] 그의 손이 지켜주셨기에\n[00:29.84] 오늘 내 눈에 보이지 않고\n[00:37.35] 오늘 내 손에 잡히지 않아도\n[00:44.85] 그의 눈이 날 지켜보셨고\n[00:52.46] 그의 손이 지켜주셨기에\n[01:00.97] 예수 그리스도로\n[01:08.96] 말미암아 우리에게\n[01:16.30] 이김을 주시는\n[01:22.53] 하나님께 감사하노니\n[01:30.03] 그러므로 사랑하는\n[01:37.16] 형제들이 흔들리지 않기를\n[01:45.47] 오늘 하루가 주 안에서\n[01:52.53] 헛되지 않음을 기억하기를\n[02:00.43] 오늘 내 눈에 보이지 않고\n[02:08.18] 오늘 내 손에 잡히지 않아도\n[02:15.76] 그의 눈이 날 지켜보셨고\n[02:23.41] 그의 손이 지켜주셨기에\n[02:31.73] 그러므로 사랑하는\n[02:39.38] 형제들이 흔들리지 않기를\n[02:47.23] 오늘 하루가 주 안에서\n[02:54.14] 헛되지 않음을 기억하기를\n[03:02.46] 그러므로 사랑하는\n[03:09.97] 형제들이 흔들리지 않기를\n[03:17.75] 오늘 하루가 주 안에서\n[03:24.76] 헛되지 않음을 기억하기를\n[03:32.33] 헛되지 않음을 기억하기를",
                    "syncOffset": 0,
                    "syncMinGap": 0.22
                },
                {
                    "id": "6b773272-179d-481a-9404-11027faf49a4",
                    "title": "우리가 주를 더욱 사랑하고",
                    "artist": "Andre Youth",
                    "url": "https://drive.google.com/file/d/1XkOt0YcLUtxx83w0HNeFwt09nRxyDKuq/view?usp=sharing",
                    "cover": "https://drive.google.com/file/d/1voANoQ1zgiAGe0WxCv2bM_JurdyOHWUB/view?usp=sharing",
                    "lyrics": "[00:16.87] 큰 사랑 우리게 찾아왔네\n[00:24.05] 자기 몸 희생하며 확증하신 사랑\n[00:31.15] 먼저 본이 되신 이가 우리게 명하시네\n[00:37.59] 네 마음과 뜻 힘 다해 주를 사랑하라\n[00:44.85] 무엇보다 뜨겁게 서로 사랑할지니\n[00:51.97] 사랑이 모든 것을 덮어주네\n[00:59.32] 사랑 가운데 우리 온전히 살아갈 때\n[01:06.29] 우리 삶이 그의 기쁨 되네\n[01:12.48] 우리가 주를 더욱 사랑하고\n[01:16.14] 그 사랑 우리 삶에 녹아내어\n[01:19.67] 서로를 더욱 섬기고 사랑할 때\n[01:23.19] 하나님 나라 임하겠네\n[01:26.89] 우리가 주를 더욱 노래하고\n[01:30.45] 이곳에 함께 모여 찬양하니\n[01:33.97] 모든 두려움과 걱정은 떠나가네\n[01:37.54] 주 사랑만이 이곳에 가득해\n[01:52.89] 큰 사랑 우리게 찾아왔네\n[02:00.01] 자기 몸 희생하며 확증하신 사랑\n[02:07.19] 먼저 본이 되신 이가 우리게 명하시네\n[02:13.63] 네 마음과 뜻 힘 다해 주를 사랑하라\n[02:20.89] 무엇보다 뜨겁게 서로 사랑할지니\n[02:27.98] 사랑이 모든 것을 덮어주네\n[02:35.20] 사랑 가운데 우리 온전히 살아갈 때\n[02:42.27] 우리 삶이 그의 기쁨 되네\n[02:48.49] 우리가 주를 더욱 사랑하고\n[02:52.15] 그 사랑 우리 삶에 녹아내어\n[02:55.66] 서로를 더욱 섬기고 사랑할 때\n[02:59.19] 하나님 나라 임하겠네\n[03:02.89] 우리가 주를 더욱 노래하고\n[03:06.45] 이곳에 함께 모여 찬양하니\n[03:10.02] 모든 두려움과 걱정은 떠나가네\n[03:13.55] 주 사랑만이 이곳에 가득해\n[03:20.55] 가득해\n[03:31.11] 우리가 주를 더욱 사랑하고\n[03:34.70] 그 사랑 우리 삶에 녹아내어\n[03:38.23] 서로를 더욱 섬기고 사랑할 때\n[03:41.81] 하나님 나라 임하겠네\n[03:45.46] 우리가 주를 더욱 노래하고\n[03:49.02] 이곳에 함께 모여 찬양하니\n[03:52.61] 모든 두려움과 걱정은 떠나가네\n[03:56.16] 주 사랑만이 이곳에 가득해\n[04:06.78] 우리가 주를 더욱 사랑하고\n[04:10.34] 그 사랑 우리 삶에 녹아내어\n[04:13.87] 서로를 더욱 섬기고 사랑할 때\n[04:17.44] 하나님 나라 임하겠네\n[04:21.07] 우리가 주를 더욱 노래하고\n[04:24.73] 이곳에 함께 모여 찬양하니\n[04:28.26] 모든 두려움과 걱정은 떠나가네\n[04:31.79] 주 사랑만이 이곳에 가득해\n[04:38.93] 주 사랑만이 이곳에\n[04:46.06] 주 사랑만이 이곳에\n[04:53.06] 가득해\n[05:00.20] 가득해\n[05:03.05] 가득해\n[05:03.22] 가득해",
                    "syncOffset": 0,
                    "syncMinGap": 0.22
                },
                {
                    "id": "ce86ea56-2db1-4294-bb9d-3ea84f4f70f5",
                    "title": "행복",
                    "artist": "Andre Youth",
                    "url": "https://drive.google.com/file/d/1Zw7XFUtuvbsmjA2rByE6L_j-J64uRh3V/view?usp=sharing",
                    "cover": "https://drive.google.com/file/d/1HjubZgjwC4jm3wQ4AFIgGgZTFgUEMc-r/view?usp=sharing",
                    "lyrics": "[00:57.99] 화려하지 않아도\n[01:04.44] 정결하게 사는 삶\n[01:11.72] 가진 것이 적어도\n[01:17.79] 감사하며 사는 삶\n[01:25.14] 내게 주신 작은 힘\n[01:31.81] 나눠주며 사는 삶\n[01:38.17] 이것이 나의 삶의 행복이라오\n[01:55.42] 눈물 날 일 많지만\n[02:01.89] 기도할 수 있는 것\n[02:08.39] 억울한 일 많으나\n[02:14.72] 주를 위해 참는 것\n[02:22.12] 비록 짧은 작은 삶\n[02:28.26] 주 뜻대로 사는 것\n[02:35.48] 이것이 나의 삶의 행복이라오\n[02:47.55] 이것이 행복\n[02:51.55] 행복이라오\n[02:54.78] 세상은 알 수 없는 하나님 선물\n[03:00.78] 이것이 행복\n[03:04.64] 행복이라오\n[03:07.80] 하나님의 자녀로 살아가는 것\n[03:16.51] 이것이 행복이라오\n[03:35.18] 이것이 행복\n[03:38.73] 행복이라오\n[03:41.51] 세상은 알 수 없는 하나님 선물\n[03:48.11] 이것이 행복\n[03:51.70] 행복이라오\n[03:54.72] 하나님의 자녀로 살아가는 것\n[04:03.37] 이것이 행복이라오\n[04:14.16] 이것이 행복\n[04:17.75] 행복이라오\n[04:20.71] 세상은 알 수 없는 하나님 선물\n[04:27.46] 이것이 행복\n[04:30.78] 행복이라오\n[04:33.68] 하나님의 자녀로 살아가는 것\n[04:42.35] 이것이 행복이라오",
                    "syncOffset": 0,
                    "syncMinGap": 0.22
                },
                {
                    "id": "15335cd3-9dba-44fa-8808-ab40bb8fd583",
                    "title": "첫째되는 계명",
                    "artist": "Andre Youth",
                    "url": "https://drive.google.com/file/d/1jsuQf7mptLyu_y7xXNOxrPE1unjpsNH4/view?usp=sharing",
                    "cover": "https://drive.google.com/file/d/1e7gSlwgcshA-d_SQAH6Ks6N14IHcdDPX/view?usp=sharing",
                    "lyrics": "[00:37.71] 내 마음 다하고 목숨을\n[00:45.72] 내 뜻을 다하여 주 나의 하나님 사랑\n[00:55.05] 마음을 목숨을\n[01:04.20] 내 뜻을 다해 하나님 사랑 하리라\n[01:16.28] 내 마음 다하고 목숨을\n[01:24.20] 내 뜻을 다하여 주 나의 하나님 사랑\n[01:33.25] 마음을 목숨을\n[01:43.18] 내 뜻을 다해 하나님 사랑 하리라\n[01:52.65] 내 마음 다하고\n[01:59.70] 목숨을 다하고\n[02:05.78] 내 뜻 다하여 주 나의 하나님\n[02:15.19] 사랑 사랑하리라\n[02:22.69] 내 마음 다하고 목숨을\n[02:30.76] 내 뜻을 다하여 주 나의 하나님 사랑\n[02:39.73] 마음을 목숨을\n[02:49.67] 내 뜻을 다해 하나님 사랑 하리라\n[03:00.19] 내 마음 다하고\n[03:07.81] 목숨을 다하고\n[03:13.23] 내 뜻 다하여 주 나의 하나님\n[03:22.73] 사랑 사랑하리라\n[03:29.21] 마음을 다하고\n[03:36.74] 목숨을 다하고\n[03:42.68] 내 뜻 다하여 주 나의 하나님\n[03:52.24] 사랑 사랑하리라\n[03:59.69] 마음을 다하고\n[04:07.08] 목숨을 다하고\n[04:13.18] 내 뜻 다하여 주 나의 하나님\n[04:21.72] 사랑 사랑하리라",
                    "syncOffset": 0,
                    "syncMinGap": 0.22
                },
                {
                    "id": "f55fae34-c702-45bd-89be-78f3d975857c",
                    "title": "혼자 걷지 않을 거예요",
                    "artist": "Andre Youth",
                    "url": "https://drive.google.com/file/d/1eIJNQoqZkPP2TzjcEF44Ev3lQ45XBfGB/view?usp=sharing",
                    "cover": "https://drive.google.com/file/d/1UxcBJ81r-LSyLWSshevUqpAVGPyS4yyR/view?usp=sharing",
                    "lyrics": "[00:14.35] 그대 폭풍 속을 걷고 있을 때\n[00:18.05] 비바람을 마주해야 할 때\n[00:25.45] 불빛조차 보이지 않아도\n[00:32.86] 그대 혼자 걷지 않을 거예요\n[00:41.35] 두려움 앞에서 하늘을 보아요\n[00:48.85] 외로운 그대여 걱정 마요\n[00:56.44] 꿈꾸는 그 길을 또 걷고 걸어요\n[01:03.87] 그대 혼자 걷지 않을 거예요\n[01:28.37] 그대 폭풍 속을 걷고 있을 때\n[01:35.88] 비바람을 마주해야 할 때\n[01:43.37] 불빛조차 보이지 않아도\n[01:50.90] 그대 혼자 걷지 않을 거예요\n[01:59.32] 두려움 앞에서 하늘을 보아요\n[02:06.69] 외로운 그대여 걱정 마요\n[02:14.42] 꿈꾸는 그 길을 또 걷고 걸어요\n[02:21.83] 그대 혼자 걷지 않을 거예요\n[02:39.36] 그대 폭풍 속을 걷고 있을 때\n[02:46.86] 비바람을 마주해야 할 때\n[02:54.42] 불빛조차 보이지 않아도\n[03:01.88] 그대 혼자 걷지 않을 거예요\n[03:10.39] 두려움 앞에서 하늘을 보아요\n[03:17.92] 외로운 그대여 걱정 마요\n[03:25.27] 꿈꾸는 그 길을 또 걷고 걸어요\n[03:32.87] 그대 혼자 걷지 않을 거예요",
                    "syncOffset": 0,
                    "syncMinGap": 0.22
                },
                {
                    "id": "2b194c3c-e109-44a2-80d1-ee3bab787085",
                    "title": "하나님의 사",
                    "artist": "Andre Youth",
                    "url": "https://drive.google.com/file/d/1yC1nPXMEYMGLC092WwlE2nHsqo8-F2oT/view?usp=sharing",
                    "cover": "https://drive.google.com/file/d/1xUMSClwzM8Qxzb1qP2HEio2UitfhEomA/view?usp=sharing",
                    "lyrics": "[00:42.15] 하나님의 사랑이\n[00:46.40] 당신의 삶 가운데\n[00:51.30] 가득하기를 축복합니다\n\n[00:59.20] 하나님의 은혜가\n[01:03.55] 우리 가운데\n[01:06.80] 가득하길 기도합니다\n\n[01:14.15] 하나님의 사랑이\n[01:18.40] 당신의 삶 가운데\n[01:23.10] 가득하기를 축복합니다\n\n[01:30.20] 하나님의 은혜가\n[01:34.55] 우리 가운데\n[01:38.20] 가득하길 기도합니다\n\n[02:44.15] 하나님의 사랑이\n[02:48.40] 당신의 삶 가운데\n[02:53.30] 가득하기를 축복합니다\n\n[03:00.20] 하나님의 은혜가\n[03:04.55] 우리 가운데\n[03:07.80] 가득하길 기도합니다\n\n[03:13.50] 가득하길 기도합니다\n[03:20.10] 가득하길 기도합니다",
                    "syncOffset": 0,
                    "syncMinGap": 0.22
                }
            ];

            await firebase.database().ref('users/playlist').set(defaultSongs);
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
        return Object.assign({}, cachedSettings, {
            playlistTitle: ($('#setting-playlist-title').val() || '').trim(),
            playlistSubtitle: ($('#setting-playlist-subtitle').val() || '').trim()
        });
    }

    function writeSettingsForm(settings) {
        cachedSettings = settings || {};
        $('#setting-playlist-title').val(cachedSettings.playlistTitle || '');
        $('#setting-playlist-subtitle').val(cachedSettings.playlistSubtitle || '');
    }

    async function loadAppSettings() {
        const $status = $('#settings-status').text('설정 불러오는 중...');
        try {
            await ensureUserDb();
            const snap = await firebase.database().ref('users/appSettings').once('value');
            const settings = snap.val();
            if (settings) {
                writeSettingsForm(settings);
                $status.text('설정을 불러왔습니다.');
            } else {
                $status.text('기본 설정을 불러옵니다.');
            }
        } catch (error) {
            $status.text('설정 불러오기 실패: ' + error.message);
        }
    }

    async function saveAppSettings() {
        const $status = $('#settings-status').text('설정 저장 중...');
        const $btn = $('#btn-save-settings').prop('disabled', true);
        try {
            await ensureUserDb();
            const settings = readSettingsForm();
            await firebase.database().ref('users/appSettings').set(settings);
            $status.text('설정 저장 완료. 플레이어 새로고침 시 반영됩니다.');
        } catch (error) {
            $status.text('설정 저장 실패: ' + error.message);
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

            $img.on('error', function() {
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

    $(document).on('click', '.btn-delete-song', async function() {
        const song = $(this).data('song') || {};
        const label = song.title || song.id || '이 곡';
        if (!confirm(`'${label}' 곡을 정말 삭제할까요?`)) return;

        const $btn = $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

        try {
            await ensureUserDb();
            const snap = await firebase.database().ref('users/playlist').once('value');
            let rawSongs = snap.val() || [];
            if (rawSongs && typeof rawSongs === 'object' && !Array.isArray(rawSongs)) {
                rawSongs = Object.values(rawSongs);
            }
            let songs = Array.isArray(rawSongs) ? rawSongs : [];
            songs = songs.filter(s => s.id !== song.id);
            await firebase.database().ref('users/playlist').set(songs);
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
        $('#edit-title').val(song && song.title ? String(song.title) : '');
        $('#edit-audio-url').val(song && song.url ? String(song.url) : '');
        $('#edit-cover-url').val(song && song.cover ? String(song.cover) : '');
        $('#edit-lyrics').val(song && (song.lyrics || song.lyricsData) ? String(song.lyrics || song.lyricsData) : '');
        $('#edit-sync-offset').val(Number.isFinite(Number(song && song.syncOffset)) ? Number(song.syncOffset) : 0);
        $('#edit-sync-min-gap').val(Number.isFinite(Number(song && song.syncMinGap)) ? Number(song.syncMinGap) : 0.22);
        const editCoverSrc = normalizeCoverUrl((song && (song.coverUrl || song.cover)) ? (song.coverUrl || song.cover) : '');
        $('#edit-cover-preview')
            .off('error')
            .attr('src', editCoverSrc || FALLBACK_COVER)
            .on('error', function() {
                if (this.src !== FALLBACK_COVER) this.src = FALLBACK_COVER;
            });
        $('#edit-overlay').addClass('active').attr('aria-hidden', 'false');

        // Reset edit drop zone labels
        $('#edit-drop-audio .file-info, #edit-drop-image .file-info').text('드래그 또는 클릭').css('opacity', '0.6');
        $('#edit-drop-audio p').text('음원 교체 (선택)').css('color', '#fff');
        $('#edit-drop-image p').text('커버 교체 (선택)').css('color', '#fff');
    }

    function closeEditModal() {
        $('#edit-overlay').removeClass('active').attr('aria-hidden', 'true');
        state.editSongId = null;
        state.editAudioFile = null;
        state.editImageFile = null;
    }

    $('#btn-edit-close').on('click', closeEditModal);
    $('#edit-overlay').on('click', function(e) {
        if (e.target === this) closeEditModal();
    });

    $(document).on('click', '.btn-edit-song', function() {
        const song = $(this).data('song') || {};
        if (song.id) {
            openEditModal(song);
        }
    });

    $('#btn-edit-save').on('click', async function() {
        const id = state.editSongId;
        if (!id) return;

        const title = $('#edit-title').val().trim();
        if (!title) {
            alert('곡 제목을 입력해주세요.');
            return;
        }

        const $status = $('#edit-status').text('저장 중...');
        const $btn = $(this).prop('disabled', true);

        try {
            await ensureUserDb();
            const snap = await firebase.database().ref('users/playlist').once('value');
            let rawData = snap.val() || [];
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
                rawData = Object.values(rawData);
            }
            const currentPlaylist = Array.isArray(rawData) ? rawData : [];

            if (!Array.isArray(currentPlaylist)) {
                throw new Error('곡 목록 데이터 형식이 올바르지 않습니다.');
            }

            const songIdx = currentPlaylist.findIndex(s => s.id === id);
            if (songIdx === -1) {
                throw new Error('해당 곡을 찾을 수 없습니다.');
            }

            const currentSong = currentPlaylist[songIdx];

            let finalAudioUrl = $('#edit-audio-url').val().trim() || currentSong.url;
            if (state.editAudioFile) {
                $status.text('음원 파일 변환 중...');
                finalAudioUrl = await fileToDataUrl(state.editAudioFile);
            }

            let finalCoverUrl = $('#edit-cover-url').val().trim() || currentSong.cover;
            if (state.editImageFile) {
                $status.text('커버 이미지 변환 중...');
                finalCoverUrl = await fileToDataUrl(state.editImageFile);
            }

            currentSong.title = title;
            currentSong.url = finalAudioUrl || '';
            currentSong.cover = finalCoverUrl || FALLBACK_COVER;
            currentSong.lyrics = $('#edit-lyrics').val().trim();
            currentSong.lyricsData = $('#edit-lyrics').val().trim();
            currentSong.syncOffset = parseFloat($('#edit-sync-offset').val()) || 0;
            currentSong.syncMinGap = parseFloat($('#edit-sync-min-gap').val()) || 0.22;

            $status.text('파이어베이스에 저장 중...');
            await firebase.database().ref('users/playlist').set(currentPlaylist);
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
});
