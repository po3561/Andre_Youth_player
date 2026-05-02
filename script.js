$(document).ready(function() {
    const firebaseConfig = {
        apiKey: "AIzaSyDt1XdEfx760ojnETRw-HYqJQOP8GK5fXE",
        authDomain: "busan-youth-player.firebaseapp.com",
        databaseURL: "https://busan-youth-player-default-rtdb.firebaseio.com",
        projectId: "busan-youth-player",
        storageBucket: "busan-youth-player.firebasestorage.app",
        messagingSenderId: "406016035492",
        appId: "1:406016035492:web:e3d03145aefa945c707431"
    };

    const audio = document.getElementById('audio-engine');
    const GAS_URL = (window.APP_CONFIG && window.APP_CONFIG.GAS_URL)
        ? window.APP_CONFIG.GAS_URL
        : "https://script.google.com/macros/s/AKfycby_hiKUz2Y2dv6WFBGCmaiXl08AqPijiw6yZlLbxLJDTFud10FW19vSrrf9Z6IVz75oGg/exec";
    const ENABLE_REMOTE_PLAYLIST_SYNC = true;
    const PLAYLIST_CACHE_KEY = 'andreYouthPlaylistCache_v8';
    const PLAYLIST_CACHE_TTL = 1000 * 60 * 60 * 24; // 24시간 캐시 유지 (빠른 로딩을 위해)

    let curIdx = -1;
    let isShuffle = false;
    let repeatMode = 0; // 0: None, 1: Repeat All, 2: Repeat One
    let btnLock = false;
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    let myLikedMsgs = JSON.parse(localStorage.getItem('myLikedMsgs')) || [];
    let playlistData = [];
    let appSettings = null;
    let playlistRevision = '';
    let currentLyrics = [];
    const failedTitles = new Set();
    const fallbackImage = MusicEngine.placeholderImage || "";
    let firebaseLoadPromise = null;
    let chatDb = null;
    let userDb = null; // New: Reference for users
    let chatListenersReady = false;
    let lyricsAutoScrollEnabled = true;
    let lyricsAutoScrollTimer = null;
    let lyricsProgrammaticScrollLock = false;
    let lyricsProgrammaticScrollTimer = null;
    let lastActiveLyricIdx = -1;
    let lastLyricsScrollAt = 0;

    localStorage.setItem('chatUserId', userId);

    function escapeHtml(value = "") {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function songImage(song) {
        const raw = song?.profile || song?.cover || song?.coverUrl || "";
        return MusicEngine.fixUrl(raw, 'image') || fallbackImage;
    }

    function setImageWithFallback($img, url) {
        $img.off('error').attr('src', url || fallbackImage).on('error', function() {
            if (this.src !== fallbackImage) {
                this.src = fallbackImage;
            }
        });
    }

    function readPlaylistCache() {
        try {
            const raw = localStorage.getItem(PLAYLIST_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed) return null;
            if (!parsed.ts || Date.now() - parsed.ts > PLAYLIST_CACHE_TTL) return null;
            if (Array.isArray(parsed.data)) {
                return { songs: parsed.data, settings: null };
            }
            if (Array.isArray(parsed.songs)) {
                return { songs: parsed.songs, settings: parsed.settings || null };
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function writePlaylistCache(payload) {
        try {
            localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(Object.assign({ ts: Date.now() }, payload)));
        } catch (error) {
            // Ignore storage pressure.
        }
    }

    function applyAppSettings(settings) {
        if (!settings || typeof settings !== 'object') return;
        appSettings = Object.assign({}, appSettings || {}, settings);
        const safePrimary = appSettings.themePrimary || '#21ccf9';

        document.documentElement.style.setProperty('--primary', safePrimary);
        $('.sub-title').text(appSettings.playlistTitle || 'Andre Youth Playlist');
        $('.main-title').text(appSettings.playlistSubtitle || '음악으로 길을 잇다');
        $('.lyrics-hint').text(appSettings.lyricHintText || 'TAP FOR LYRICS');
        if (appSettings.copyrightNotice) {
            $('.copyright-notice').text(appSettings.copyrightNotice);
        }
    }

    function hydratePlaylistCache() {
        const cached = readPlaylistCache();
        const source = cached && Array.isArray(cached.songs) && cached.songs.length ? cached.songs : [];
        if (!source.length) return false;
        if (cached && cached.settings) {
            applyAppSettings(cached.settings);
        }
        if (cached && cached.revision) {
            playlistRevision = String(cached.revision);
        }
        playlistData = source;
        render();
        renderCopyright();
        const firstPlayable = getNextPlayableIndex(0);
        if (firstPlayable !== -1) {
            requestAnimationFrame(() => load(firstPlayable, false));
        }
        return true;
    }

    function getSongUrl(song) {
        return song?.url || song?.audioUrl || '';
    }

    function getPlayableIndices() {
        return playlistData
            .map((song, index) => ({ song, index }))
            .filter(item => item.song && getSongUrl(item.song) && !failedTitles.has(item.song.title))
            .map(item => item.index);
    }

    function getNextPlayableIndex(startIndex) {
        if (!playlistData.length) return -1;
        for (let step = 0; step < playlistData.length; step++) {
            const idx = (startIndex + step + playlistData.length) % playlistData.length;
            const s = playlistData[idx];
            if (s && getSongUrl(s) && !failedTitles.has(s.title)) return idx;
        }
        return -1;
    }

    function getPrevPlayableIndex(startIndex) {
        if (!playlistData.length) return -1;
        for (let step = 0; step < playlistData.length; step++) {
            const idx = (startIndex - step + playlistData.length) % playlistData.length;
            if (!failedTitles.has(playlistData[idx]?.title)) return idx;
        }
        return -1;
    }

    function getRandomPlayableIndex() {
        const playable = getPlayableIndices();
        if (playable.length === 0) return -1;
        if (playable.length === 1) return playable[0];
        
        // Exclude current index to avoid repeat in shuffle
        const others = playable.filter(idx => idx !== curIdx);
        const target = others.length > 0 ? others : playable;
        return target[Math.floor(Math.random() * target.length)];
    }

    function isSingleTrackPlaylist() {
        return playlistData.filter(item => item && item.title).length <= 1;
    }

    const audioSourceCache = new Map();
    let activeAudioObjectUrl = null;
    let audioLoadToken = 0;

    async function resolveAudioSource(song, fixedAudio) {
        if (!fixedAudio) return '';
        const cacheKey = song?.audioFileId || song?.url || fixedAudio;
        
        // Return from memory cache if available
        if (audioSourceCache.has(cacheKey)) {
            return audioSourceCache.get(cacheKey);
        }

        // Use the URL directly (it now points to api.codetabs.com proxy which handles CORS)
        audioSourceCache.set(cacheKey, fixedAudio);
        return fixedAudio;
    }

    function preloadNextTrack() {
        const nextIdx = isShuffle ? getRandomPlayableIndex() : getNextPlayableIndex(curIdx + 1);
        if (nextIdx === -1 || nextIdx === curIdx) return;
        
        const nextSong = playlistData[nextIdx];
        if (nextSong && nextSong.url) {
            const fixed = MusicEngine.fixUrl(nextSong.url, 'audio');
            // Background resolve (won't block UI)
            void resolveAudioSource(nextSong, fixed).then(url => {
                console.log('Next track preloaded:', nextSong.title);
            }).catch(() => {});
        }
    }

    function jumpToLyric(time) {
        if (Number.isNaN(time)) return;
        audio.currentTime = Math.max(0, time);
        if (audio.paused) {
            audio.play().catch(() => {});
        }
        if (!$('#album-trigger').hasClass('show-lyrics')) {
            $('#album-trigger').addClass('show-lyrics');
        }
        updateLyricsUI(audio.currentTime);
    }

    function setLyricsAutoScrollEnabled(enabled) {
        lyricsAutoScrollEnabled = enabled;
        clearTimeout(lyricsAutoScrollTimer);
        if (!enabled) {
            lyricsAutoScrollTimer = setTimeout(() => {
                lyricsAutoScrollEnabled = true;
                updateLyricsUI(audio.currentTime);
            }, 4000);
        }
    }

    function markLyricsManualInteraction() {
        if (lyricsProgrammaticScrollLock) return;
        setLyricsAutoScrollEnabled(false);
    }

    function beginProgrammaticLyricsScroll() {
        lyricsProgrammaticScrollLock = true;
        clearTimeout(lyricsProgrammaticScrollTimer);
        lyricsProgrammaticScrollTimer = setTimeout(() => {
            lyricsProgrammaticScrollLock = false;
        }, 1200);
    }

    let isScrubbing = false;

    function formatTime(s) {
        const safe = Number.isFinite(s) ? s : 0;
        const m = Math.floor(safe / 60);
        const sc = Math.floor(safe % 60);
        return `${m}:${sc < 10 ? '0' + sc : sc}`;
    }

    function seekByProgress(percent) {
        if (!Number.isFinite(percent) || Number.isNaN(audio.duration) || audio.duration <= 0) return;
        try {
            const nextTime = Math.max(0, Math.min(audio.duration, (percent / 100) * audio.duration));
            audio.currentTime = nextTime;
            $('#time-now').text(formatTime(nextTime));
            if ($('#album-trigger').hasClass('show-lyrics')) {
                updateLyricsUI(nextTime);
            }
        } catch (err) {
            console.error("Seek error:", err);
        }
    }

    setImageWithFallback($('#album-img'), fallbackImage);
    setImageWithFallback($('#artist-avatar'), fallbackImage);

    function syncHearts() {
        if (!playlistData.length) return;
        const curTitle = playlistData[curIdx]?.title;
        const isFav = scrappedSongs.includes(curTitle);
        $('#btn-scrap')
            .toggleClass('active', isFav)
            .find('i')
            .attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');

        $('#song-list-ul li').each(function(i) {
            const item = playlistData[i];
            if (!item) return;
            const isSet = scrappedSongs.includes(item.title);
            $(this)
                .toggleClass('active', i === curIdx)
                .find('.list-heart-btn')
                .toggleClass('active', isSet)
                .find('i')
                .attr('class', isSet ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        });
    }

    function toggleFav(title) {
        const idx = scrappedSongs.indexOf(title);
        if (idx === -1) scrappedSongs.push(title);
        else scrappedSongs.splice(idx, 1);
        localStorage.setItem('myScraps', JSON.stringify(scrappedSongs));
        syncHearts();
    }

    function checkAdminSession() {
        try {
            const adminUser = JSON.parse(localStorage.getItem('adminUser'));
            if (adminUser && adminUser.isApproved) {
                $('#btn-show-login')
                    .html('<i class="fa-solid fa-screwdriver-wrench"></i> 관리자 페이지 바로가기')
                    .off('click')
                    .on('click', () => {
                        window.location.href = 'admin.html';
                    });
            } else {
                $('#btn-show-login')
                    .html('<i class="fa-solid fa-user-shield"></i> 관리자 로그인')
                    .off('click')
                    .on('click', () => {
                        $('.info-menu-buttons').hide();
                        $('#login-section').removeClass('hidden-section').hide().fadeIn(300);
                        $('#login-id, #login-pw').val('');
                    });
            }
        } catch(e) {
            console.error('Session check error', e);
        }
    }

    function setupInfoOverlayEvents() {
        // Initial check
        checkAdminSession();

        $('#btn-go-signup').on('click', () => {
            $('#login-section').hide();
            $('#signup-section').removeClass('hidden-section').hide().fadeIn(300);
            $('#signup-section input').val(''); // Clear inputs
        });

        $('#btn-back-to-menu').on('click', () => {
            $('.auth-section').hide();
            $('.info-menu-buttons').fadeIn(300);
        });

        $('#btn-back-to-login').on('click', () => {
            $('#signup-section').hide();
            $('#login-section').fadeIn(300);
            $('#login-id, #login-pw').val(''); // Clear inputs
        });

        $('#btn-inquiry').on('click', () => {
            // Using mailto to open email client natively
            window.location.href = "mailto:ej210651392@gmail.com?subject=Andre Youth Player - 플레이리스트 문의";
        });

        // Signup Submit
        $('#btn-signup-submit').on('click', async () => {
            const data = {
                id: $('#signup-id').val().trim(),
                pw: $('#signup-pw').val().trim(),
                name: $('#signup-name').val().trim(),
                phone: $('#signup-phone').val().trim(),
                unique: $('#signup-unique').val().trim(),
                company: $('#signup-company').val().trim(),
                position: $('#signup-position').val().trim(),
                isApproved: false,
                isAdmin: false,
                timestamp: Date.now()
            };

            if (!data.id || !data.pw || !data.name || !data.phone || !data.unique || !data.company || !data.position) {
                alert('모든 필수 정보를 입력해주세요.');
                return;
            }

            try {
                await ensureUserDb();
                
                // Check if ID already exists
                const snapshot = await userDb.orderByChild('id').equalTo(data.id).once('value');
                if (snapshot.exists()) {
                    alert('이미 존재하는 아이디입니다.');
                    return;
                }

                await userDb.push(data);
                alert('가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.');
                $('#btn-back-to-login').trigger('click');
                // Clear fields
                $('#signup-section input').val('');
            } catch (error) {
                console.error('Signup Error:', error);
                alert('가입 신청 중 오류가 발생했습니다.');
            }
        });

        // Login Submit
        $('#btn-login-submit').on('click', async () => {
            const id = $('#login-id').val().trim();
            const pw = $('#login-pw').val().trim();

            if (!id || !pw) {
                alert('아이디와 비밀번호를 입력해주세요.');
                return;
            }

            // 최고 관리자(Master Admin) 하드코딩 패스
            if (id === 'ej210651392@gmail.com' && pw === 'sadcandypo136!') {
                alert('최고 관리자님, 환영합니다!');
                localStorage.setItem('adminUser', JSON.stringify({
                    id: id,
                    name: '최고 관리자(Master)',
                    isApproved: true,
                    isAdmin: true
                }));
                window.location.href = 'admin.html';
                return;
            }

            try {
                await ensureUserDb();
                const snapshot = await userDb.orderByChild('id').equalTo(id).once('value');
                
                if (!snapshot.exists()) {
                    alert('존재하지 않는 아이디입니다.');
                    return;
                }

                let userData = null;
                snapshot.forEach(child => {
                    if (child.val().pw === pw) {
                        userData = child.val();
                    }
                });

                if (!userData) {
                    alert('비밀번호가 일치하지 않습니다.');
                    return;
                }

                if (!userData.isApproved) {
                    alert('아직 관리자 승인이 완료되지 않았습니다.');
                    return;
                }

                // Success
                alert(`${userData.name}님, 환영합니다!`);
                localStorage.setItem('adminUser', JSON.stringify(userData));
                
                // Redirect to admin page if admin
                window.location.href = 'admin.html';
                
            } catch (error) {
                console.error('Login Error:', error);
                alert('로그인 중 오류가 발생했습니다.');
            }
        });
    }

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

    function renderCopyright() {
        // Deprecated: replaced by setupInfoOverlayEvents
    }

    function renderLyrics() {
        const $area = $('#lyrics-scroll-area').empty();
        if (currentLyrics.length === 0) {
            $area.append('<div class="lyric-line no-data">가사 데이터 형식이 맞지 않습니다.</div>');
            return;
        }

        currentLyrics.forEach((l, i) => {
            $area.append(`<div class="lyric-line" id="lyric-${i}" data-time="${l.time}">${escapeHtml(l.text)}</div>`);
        });

        $('.lyric-line').off('click').on('click', function(e) {
            e.stopPropagation();
            const time = parseFloat($(this).data('time'));
            if (!isNaN(time)) {
                markLyricsManualInteraction();
                jumpToLyric(time);
            }
        });
    }

    function updateLyricsUI(currentTime) {
        if (!currentLyrics || currentLyrics.length === 0) return;

        // Advance pointer instead of scanning all lines every tick.
        let activeIdx = lastActiveLyricIdx;
        if (activeIdx < 0) activeIdx = 0;

        if (activeIdx > 0 && currentTime < currentLyrics[activeIdx].time) {
            while (activeIdx > 0 && currentTime < currentLyrics[activeIdx].time) activeIdx--;
        } else {
            while (activeIdx + 1 < currentLyrics.length && currentTime >= currentLyrics[activeIdx + 1].time) activeIdx++;
        }

        if (activeIdx < 0 || activeIdx >= currentLyrics.length) return;
        if (activeIdx === lastActiveLyricIdx) return;

        if (lastActiveLyricIdx >= 0) {
            $(`#lyric-${lastActiveLyricIdx}`).removeClass('active');
        }
        const $activeLine = $(`#lyric-${activeIdx}`).addClass('active');
        lastActiveLyricIdx = activeIdx;

        const container = $('.lyrics-container')[0];
        if (lyricsAutoScrollEnabled && container && $activeLine[0]) {
            const now = performance.now();
            if (now - lastLyricsScrollAt < 220) return;
            lastLyricsScrollAt = now;

            const lineOffset = $activeLine[0].offsetTop;
            const lineSize = $activeLine[0].offsetHeight;
            const containerSize = container.offsetHeight;
            const scrollTarget = lineOffset - (containerSize / 2) + (lineSize / 2);
            beginProgrammaticLyricsScroll();
            // Frequent smooth scrolling can cause lyric lag; throttle + jump instantly.
            container.scrollTo({ top: scrollTarget, behavior: 'auto' });
        }
    }

    // fetchPlaylist() is defined later with caching + sync; keep a single implementation.

    async function ensureLyricsForSong(song) {
        if (!song || !song.id) return song;
        if (song.lyricsData) return song;
        try {
            let payload = null;
            const ts = Date.now();
            try {
                const response = await fetchWithTimeout(`${GAS_URL}?action=lyrics&id=${encodeURIComponent(song.id)}&_t=${ts}`, { cache: 'no-store' }, 2500);
                payload = await response.json();
            } catch (fetchError) {
                payload = await jsonpGet({ action: 'lyrics', id: song.id, _t: ts }, 8000);
            }
            if (payload && payload.status === 'ok') {
                song.lyricsData = payload.lyricsData || '';
                if (Number.isFinite(Number(payload.syncOffset))) {
                    song.syncOffset = Number(payload.syncOffset);
                }
            }
        } catch (error) {
            console.warn('Lyrics fetch failed:', error);
        }
        return song;
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function jsonpGet(params = {}, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const requestId = `jsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const callbackName = `__jsonp_${requestId}`;
            const url = new URL(GAS_URL);
            Object.keys(params).forEach(key => {
                if (params[key] === undefined || params[key] === null) return;
                url.searchParams.set(key, String(params[key]));
            });
            url.searchParams.set('callback', callbackName);

            const script = document.createElement('script');
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('JSONP timeout'));
            }, timeoutMs);

            function cleanup() {
                clearTimeout(timeoutId);
                try {
                    delete window[callbackName];
                } catch (error) {
                    window[callbackName] = undefined;
                }
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[callbackName] = payload => {
                cleanup();
                resolve(payload);
            };
            script.onerror = () => {
                cleanup();
                reject(new Error('JSONP failed'));
            };
            script.async = true;
            script.src = url.toString();
            document.head.appendChild(script);
        });
    }

    async function fetchBootstrapPayload(options = {}) {
        const includeLyrics = options.includeLyrics ? '1' : '0';
        const lyricsLimit = Number(options.lyricsLimit || 0);
        const ts = Date.now();
        const url = `${GAS_URL}?action=bootstrap&includeLyrics=${includeLyrics}&lyricsLimit=${lyricsLimit}&_t=${ts}`;
        try {
            const response = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
            const payload = await response.json();
            if (payload && payload.status === 'ok') return payload;
            throw new Error('invalid bootstrap payload');
        } catch (error) {
            const payload = await jsonpGet({
                action: 'bootstrap',
                includeLyrics: includeLyrics,
                lyricsLimit: lyricsLimit,
                _t: ts
            }, 8000);
            return payload;
        }
    }

    function warmupLyricsAround(index) {
        if (!Array.isArray(playlistData) || !playlistData.length) return;
        const candidates = [index, index + 1, index - 1];
        candidates.forEach(i => {
            const idx = (i + playlistData.length) % playlistData.length;
            const song = playlistData[idx];
            if (!song || song.lyricsData) return;
            void ensureLyricsForSong(song);
        });
    }

    function load(i, play = false) {
        if (!playlistData.length) return;
        
        // Find best playable index starting from i
        let targetIdx = i;
        const s = playlistData[targetIdx];
        
        // If the current candidate is invalid (no URL or marked failed), find the next one
        if (!s || !getSongUrl(s) || failedTitles.has(s.title)) {
            targetIdx = getNextPlayableIndex(targetIdx + 1);
            if (targetIdx === -1 || targetIdx === i) {
                // If I came back to the same failed index or no playable left
                if ($('#disp-title').text() !== 'Loading...') {
                    $('#disp-title').text('재생 가능한 곡이 없습니다.');
                }
                return;
            }
            return load(targetIdx, play);
        }

        curIdx = targetIdx;
        const finalSong = playlistData[curIdx];

        const fixedAudio = MusicEngine.fixUrl(getSongUrl(s), 'audio');
        const fixedCover = songImage(s);

        const loadToken = ++audioLoadToken;
        audio.pause();
        audio.removeAttribute('src');
        audio.removeAttribute('crossorigin');
        audio.load();

        setImageWithFallback($('#album-img'), fixedCover);
        setImageWithFallback($('#artist-avatar'), fixedCover);
        $('#bg-image').css('background-image', `url('${fixedCover}')`);
        $('#album-trigger').removeClass('show-lyrics').css('background-image', `url('${fixedCover}')`);
        setLyricsAutoScrollEnabled(true);
        $('#disp-title').text(s.title || 'Untitled');
        $('#disp-artist').text(s.artist || 'Andre Youth');

        lastActiveLyricIdx = -1;
        if (s.lyricsData) {
            currentLyrics = MusicEngine.parseLyrics(s.lyricsData, Number(s.syncOffset) || 0);
            renderLyrics();
        } else {
            $('#lyrics-scroll-area').html('<div class="lyric-line no-data">등록된 가사가 없습니다.</div>');
            currentLyrics = [];
            void ensureLyricsForSong(s).then(updatedSong => {
                if (curIdx !== targetIdx || !updatedSong || !updatedSong.lyricsData) return;
                currentLyrics = MusicEngine.parseLyrics(updatedSong.lyricsData, Number(updatedSong.syncOffset) || 0);
                renderLyrics();
                updateLyricsUI(audio.currentTime);
            });
        }

        render();
        syncHearts();
        warmupLyricsAround(curIdx);

        void resolveAudioSource(s, fixedAudio)
            .then(async resolvedAudio => {
                if (loadToken !== audioLoadToken) {
                    if (resolvedAudio && resolvedAudio.startsWith('blob:')) {
                        URL.revokeObjectURL(resolvedAudio);
                    }
                    return;
                }

                if (activeAudioObjectUrl && activeAudioObjectUrl.startsWith('blob:') && activeAudioObjectUrl !== resolvedAudio) {
                    URL.revokeObjectURL(activeAudioObjectUrl);
                }
                activeAudioObjectUrl = resolvedAudio && resolvedAudio.startsWith('blob:') ? resolvedAudio : null;

                audio.src = resolvedAudio;
                audio.load();

                if (play) {
                    audio.play().then(() => {
                        // Successfully playing, trigger preload for next track
                        preloadNextTrack();
                    }).catch(e => {
                        console.error('Playback System Error:', e.name, e.message);
                        if (e.name === 'NotAllowedError') {
                            $('#disp-title').text('화면을 클릭하면 재생됩니다.');
                        }
                    });
                }
            })
            .catch(error => {
                console.error('Audio Source Error:', error);
                const failed = playlistData[curIdx];
                if (failed?.title) failedTitles.add(failed.title);
                const nextIdx = getNextPlayableIndex(curIdx + 1);
                if (nextIdx === -1 || nextIdx === i) {
                    $('#disp-title').text('재생 가능한 곡이 없습니다.');
                    return;
                }
                load(nextIdx, play);
            });
    }

    function next() {
        if (isSingleTrackPlaylist()) {
            audio.currentTime = 0;
            if (audio.paused) {
                audio.play().catch(() => {});
            }
            return;
        }
        const n = isShuffle ? getRandomPlayableIndex() : getNextPlayableIndex(curIdx + 1);
        
        if (n === -1) {
            // Only show message if we actually gave up
            return;
        }
        load(n, true);
    }

    function prev() {
        if (isSingleTrackPlaylist()) {
            audio.currentTime = 0;
            if (audio.paused) {
                audio.play().catch(() => {});
            }
            return;
        }
        const p = getPrevPlayableIndex(curIdx - 1);
        if (p === -1) {
            $('#disp-title').text('재생 가능한 곡이 없습니다.');
            return;
        }
        load(p, true);
    }

    function openSb() {
        $('#main-header').addClass('mode-volume');
        clearTimeout(openSb.timer);
        openSb.timer = setTimeout(() => $('#main-header').removeClass('mode-volume'), 3500);
    }

    function loadScriptOnce(src) {
        return new Promise((resolve, reject) => {
            if ([...document.scripts].some(script => script.src === src)) {
                resolve();
                return;
            }

            const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.dataset.dynamicSrc = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function ensureChatDb() {
        if (chatDb) return chatDb;
        if (!firebaseLoadPromise) {
            firebaseLoadPromise = (async () => {
                if (typeof window.firebase === 'undefined' || typeof window.firebase.database !== 'function') {
                    await loadScriptOnce('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
                    await loadScriptOnce('https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js');
                }

                if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
                chatDb = firebase.database().ref('messages');
                return chatDb;
            })().catch(error => {
                firebaseLoadPromise = null;
                throw error;
            });
        }

        const db = await firebaseLoadPromise;
        if (!chatListenersReady) {
            chatListenersReady = true;

            $('#btn-send-chat').off('click.chat').on('click.chat', async () => {
                const t = $('#chat-input').val().trim();
                if (!t) return;
                await ensureChatDb();
                chatDb.push({ text: t, sender: userId, timestamp: Date.now(), likeCount: 0 });
                $('#chat-input').val('');
            });

            $('#chat-input').off('keypress.chat').on('keypress.chat', function(e) {
                if (e.which === 13) {
                    e.preventDefault();
                    $('#btn-send-chat').click();
                }
            });

            chatDb.limitToLast(30).on('child_added', (snap) => {
                const key = snap.key;
                const m = snap.val();
                const isMe = m.sender === userId;
                const iLike = myLikedMsgs.includes(key);
                
                // Add timestamp display if available
                let timeStr = '';
                if (m.timestamp) {
                    const dt = new Date(m.timestamp);
                    timeStr = `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
                }

                $('#chat-messages').append(`
                    <div class="msg-row" data-key="${key}">
                        <div class="msg-bubble-wrap ${isMe ? 'me' : 'other'}">
                            <div class="message ${isMe ? 'me' : 'other'}">
                                ${escapeHtml(m.text || '')}
                                ${timeStr ? `<span class="msg-time">${timeStr}</span>` : ''}
                            </div>
                            <button class="msg-like-btn ${iLike ? 'liked' : ''}" data-key="${key}">
                                <i class="${iLike ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                                <span class="like-count">${m.likeCount || ''}</span>
                            </button>
                        </div>
                    </div>`);
                const viewport = $('.chat-viewport')[0];
                if (viewport) {
                    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
                }
            });

            // Make sure real-time likes dynamically update counts
            chatDb.limitToLast(30).on('child_changed', (snap) => {
                const key = snap.key;
                const m = snap.val();
                const $row = $(`.msg-row[data-key="${key}"]`);
                if ($row.length) {
                    $row.find('.like-count').text(m.likeCount || '');
                }
            });

            $(document).off('click.chatLike').on('click.chatLike', '.msg-like-btn', function() {
                const key = $(this).data('key');
                const isLiked = $(this).hasClass('liked');
                chatDb.child(key).transaction(p => {
                    if (p) p.likeCount = (p.likeCount || 0) + (isLiked ? -1 : 1);
                    return p;
                });
                if (isLiked) myLikedMsgs = myLikedMsgs.filter(k => k !== key);
                else myLikedMsgs.push(key);
                localStorage.setItem('myLikedMsgs', JSON.stringify(myLikedMsgs));
                $(this).toggleClass('liked', !isLiked).find('i').attr('class', !isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
            });
        }

        return db;
    }

    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();

        playlistData.forEach((s, i) => {
            const imageUrl = songImage(s);
            const activeBadge = i === curIdx ? '<span class="song-badge"><i class="fa-solid fa-play"></i> NOW PLAYING</span>' : '';
            $ul.append(`
                <li class="${i === curIdx ? 'active' : ''}" data-idx="${i}">
                    <div class="song-select-zone" style="display:flex; align-items:center; flex:1; cursor:pointer;">
                        <img src="${imageUrl}" class="song-avatar" alt="Profile" onerror="this.onerror=null;this.src='${fallbackImage}'">
                        <div class="song-info-texts">
                            <strong>${escapeHtml(s.title || '')}</strong>
                            <p>${escapeHtml(s.artist || 'Andre Youth')}</p>
                            ${activeBadge}
                        </div>
                    </div>
                    <div class="list-heart-btn"><i class="fa-regular fa-heart"></i></div>
                </li>
            `);
        });

        syncHearts();
    }

    // GAS 응답 데이터의 url/cover 필드 정규화 (audioUrl/coverUrl fallback)
    function normalizeSongs(songs) {
        if (!Array.isArray(songs)) return [];
        return songs.map(s => {
            if (!s) return s;
            // url 필드가 없으면 audioUrl에서 생성
            if (!s.url && s.audioUrl) s.url = s.audioUrl;
            if (!s.url && s.audioFileId) s.url = 'https://drive.google.com/uc?export=download&id=' + s.audioFileId;
            // cover 필드가 없으면 coverUrl에서 생성
            if (!s.cover && s.coverUrl) s.cover = s.coverUrl;
            if (!s.cover && s.imageFileId) s.cover = 'https://drive.google.com/thumbnail?id=' + s.imageFileId + '&sz=w1000';
            return s;
        });
    }

    async function fetchPlaylist() {
        if (!ENABLE_REMOTE_PLAYLIST_SYNC) return;
        try {
            if (!playlistData.length || playlistData.length <= 1) {
                $('#disp-title').text('불러오는 중...');
            }

            const payload = await fetchBootstrapPayload({ includeLyrics: false, lyricsLimit: 0 });
            const rawData = payload && Array.isArray(payload.songs) ? payload.songs : [];
            const data = normalizeSongs(rawData);

            if (payload && payload.settings) {
                applyAppSettings(payload.settings);
            }

            if (Array.isArray(data) && data.length > 0) {
                // If it was empty or 1-song fallback, replace immediately
                const wasMinimal = playlistData.length <= 1;
                const currentTitle = playlistData[curIdx]?.title;
                
                playlistData = data;
                // PUBLIC_PLAYLIST도 동기화하여 admin fallback 데이터 갱신
                window.PUBLIC_PLAYLIST = data;
                playlistRevision = String(payload && payload.revision ? payload.revision : '');
                writePlaylistCache({
                    songs: data,
                    settings: payload && payload.settings ? payload.settings : appSettings,
                    revision: playlistRevision
                });
                failedTitles.clear();
                render();
                renderCopyright();

                if (currentTitle && !wasMinimal) {
                    const preservedIndex = playlistData.findIndex(song => song?.title === currentTitle);
                    if (preservedIndex !== -1) {
                        curIdx = preservedIndex;
                        render();
                        syncHearts();
                        return;
                    }
                }

                const firstPlayable = getNextPlayableIndex(0);
                load(firstPlayable === -1 ? 0 : firstPlayable, !wasMinimal ? false : true);
            } else if (!playlistData.length) {
                $('#disp-title').text('곡을 추가해주세요.');
            }
        } catch (error) {
            console.error('Playlist Fetch Error:', error);
            if (!playlistData.length) {
                if (error.message.includes('bootstrap')) {
                    $('#disp-title').text('백엔드 설정 오류');
                } else {
                    $('#disp-title').text('데이터 로드 실패');
                }
            }
        }
    }

    audio.onended = () => {
        if (repeatMode === 2) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
            return;
        }

        if (isSingleTrackPlaylist()) {
            audio.pause();
            $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
            return;
        }

        next();
    };
    audio.onerror = () => {
        const failed = playlistData[curIdx];
        if (failed?.title) failedTitles.add(failed.title);
        const nextIdx = getNextPlayableIndex(curIdx + 1);
        if (nextIdx === -1) {
            $('#disp-title').text('재생 가능한 곡이 없습니다.');
            return;
        }
        load(nextIdx, true);
    };
    audio.onplay = () => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
    audio.ontimeupdate = () => {
        if (isNaN(audio.duration) || isScrubbing) return;
        $('#progress-bar').val((audio.currentTime / audio.duration) * 100);
        $('#time-now').text(formatTime(audio.currentTime));
        $('#time-total').text(formatTime(audio.duration));

        if ($('#album-trigger').hasClass('show-lyrics')) {
            updateLyricsUI(audio.currentTime);
        }
    };

    $('#btn-vol-trigger').on('click touchstart', function(e) { e.stopPropagation(); openSb(); });
    $('#btn-vol-close').on('click touchstart', function(e) { e.stopPropagation(); $('#main-header').removeClass('mode-volume'); });
    $('#sb-volume-slider').on('input', function() { audio.volume = $(this).val() / 100; openSb(); });
    
    $('#progress-bar')
        .on('mousedown touchstart', function() {
            isScrubbing = true;
        })
        .on('input', function() {
            if (Number.isNaN(audio.duration) || audio.duration <= 0) return;
            const percent = parseFloat($(this).val());
            const nextTime = Math.max(0, Math.min(audio.duration, (percent / 100) * audio.duration));
            $('#time-now').text(formatTime(nextTime));
            if ($('#album-trigger').hasClass('show-lyrics')) {
                updateLyricsUI(nextTime);
            }
        })
        .on('mouseup touchend change', function() {
            if (isScrubbing) {
                isScrubbing = false;
                if (Number.isNaN(audio.duration) || audio.duration <= 0) return;
                const percent = parseFloat($(this).val());
                seekByProgress(percent);
            }
        });

    $('#btn-play-pause').on('click touchstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (audio.paused) {
            if (!audio.src || audio.readyState < 2) {
                const nextIdx = curIdx >= 0 ? curIdx : getNextPlayableIndex(0);
                if (nextIdx !== -1) {
                    load(nextIdx, true);
                }
                return;
            }
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    });

    $('#btn-next').click(function() { if (btnLock) return; btnLock = true; setTimeout(()=>btnLock=false, 400); next(); });
    $('#btn-prev').click(function() { if (btnLock) return; btnLock = true; setTimeout(()=>btnLock=false, 400); prev(); });
    $('#btn-shuffle').click(function() { 
        isShuffle = !isShuffle; 
        $(this).toggleClass('active', isShuffle); 
    });
    $('#btn-repeat').click(function() { 
        repeatMode = (repeatMode + 1) % 3; 
        const $icon = $(this).find('i');
        $(this).removeClass('active');
        
        if (repeatMode === 0) {
            $icon.attr('class', 'fa-solid fa-repeat').css('opacity', '0.5');
        } else if (repeatMode === 1) {
            $(this).addClass('active');
            $icon.attr('class', 'fa-solid fa-repeat').css('opacity', '1');
        } else {
            $(this).addClass('active');
            $icon.attr('class', 'fa-solid fa-repeat-1').css('opacity', '1');
        }
    });
    $('#btn-scrap').click(() => {
        if (curIdx >= 0 && playlistData[curIdx]) toggleFav(playlistData[curIdx].title);
    });

    $('#btn-open-chat').off('click').on('click', async () => {
        $('#chat-overlay').addClass('active');
        if (!chatDb) {
            $('#chat-messages').html('<div class="chat-loading">채팅을 불러오는 중...</div>');
            try {
                await ensureChatDb();
            } catch (error) {
                console.error('Chat Init Error:', error);
                $('#chat-messages').html('<div class="chat-loading">채팅을 불러오지 못했습니다.</div>');
            }
        }
    });
    $('#btn-copyright').click(() => {
        // Reset overlay state
        $('.auth-section').hide();
        $('.info-menu-buttons').show();
        checkAdminSession();
        $('#copyright-overlay').addClass('active');
    });

    setupInfoOverlayEvents();
    $('.close-x').click(function() { $(this).closest('.ios-popup').removeClass('active'); });

    $('#album-trigger').click(function() {
        $(this).toggleClass('show-lyrics');
        if ($(this).hasClass('show-lyrics')) {
            setLyricsAutoScrollEnabled(true);
            updateLyricsUI(audio.currentTime);
        }
    });

    $('.lyrics-container').on('scroll wheel touchstart pointerdown', function() {
        markLyricsManualInteraction();
    });

    let sheetStartY = 0;
    $('#sheet-trigger').on('touchstart', (e) => { sheetStartY = e.touches[0].clientY; });
    $('#sheet-trigger').on('touchmove', (e) => {
        const diff = sheetStartY - e.touches[0].clientY;
        if (diff > 60) $('#sheet').addClass('expanded'); // 임계값 상향 (40 -> 60)
        else if (diff < -60) $('#sheet').removeClass('expanded');
    });
    $('#sheet-trigger').click(() => $('#sheet').toggleClass('expanded'));

    $(document).on('click', '.song-select-zone', function() {
        load($(this).closest('li').data('idx'), true);
        $('#sheet').removeClass('expanded');
    });
    $(document).on('click', '.list-heart-btn', function(e) {
        e.stopPropagation();
        const idx = $(this).closest('li').data('idx');
        if (playlistData[idx]) toggleFav(playlistData[idx].title);
    });

    hydratePlaylistCache();

    // Check for explicit sync request from admin or URL
    const urlParams = new URLSearchParams(window.location.search);
    const forceSync = urlParams.get('sync') === 'true' || urlParams.get('refreshed') === 'true';

    if (ENABLE_REMOTE_PLAYLIST_SYNC) {
        requestAnimationFrame(() => {
            if (forceSync) {
                // Clear local cache for explicit sync
                localStorage.removeItem(PLAYLIST_CACHE_KEY);
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            // Fast-start bootstrap call; if delayed, keep cached UI and continue with async refresh.
            fetchBootstrapPayload({ includeLyrics: true, lyricsLimit: 2 })
                .then(payload => {
                    if (payload && payload.settings) applyAppSettings(payload.settings);
                    if (payload && Array.isArray(payload.songs) && payload.songs.length) {
                        playlistRevision = String(payload && payload.revision ? payload.revision : '');
                        playlistData = normalizeSongs(payload.songs);
                        window.PUBLIC_PLAYLIST = playlistData;
                        writePlaylistCache({
                            songs: playlistData,
                            settings: payload.settings || appSettings,
                            revision: playlistRevision
                        });
                        render();
                        renderCopyright();
                        if (curIdx < 0) {
                            const firstPlayable = getNextPlayableIndex(0);
                            load(firstPlayable === -1 ? 0 : firstPlayable, true);
                        }
                    } else {
                        fetchPlaylist();
                    }
                })
                .catch(() => {
                    fetchPlaylist();
                });
        });
    }

    // Add manual refresh button functionality if it exists in UI
    $('#btn-refresh-playlist').on('click', () => {
        const $btn = $('#btn-refresh-playlist');
        $btn.addClass('fa-spin disabled');
        localStorage.removeItem(PLAYLIST_CACHE_KEY);
        fetchPlaylist().finally(() => {
            $btn.removeClass('fa-spin disabled');
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        if (!ENABLE_REMOTE_PLAYLIST_SYNC) return;
        // Returning from background should quickly reconcile updates from other devices.
        fetchPlaylist().catch(() => {});
    });
});

