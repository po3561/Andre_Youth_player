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
        : "https://script.google.com/macros/s/AKfycbxv_s0YGXz-2cUzTsosgZp2BZFlKtXgVIZCCVG9441vKcsAE54gLPJEeo_a6McFQo8TZA/exec";
    const ENABLE_REMOTE_PLAYLIST_SYNC = true;
    const PLAYLIST_CACHE_KEY = 'andreYouthPlaylistCache_v7';
    const PLAYLIST_CACHE_TTL = 1000 * 30;

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
        const raw = song?.profile || song?.cover || "";
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

    function getPlayableIndices() {
        return playlistData
            .map((song, index) => ({ song, index }))
            .filter(item => item.song && item.song.url && !failedTitles.has(item.song.title))
            .map(item => item.index);
    }

    function getNextPlayableIndex(startIndex) {
        if (!playlistData.length) return -1;
        for (let step = 0; step < playlistData.length; step++) {
            const idx = (startIndex + step + playlistData.length) % playlistData.length;
            const s = playlistData[idx];
            if (s && s.url && !failedTitles.has(s.title)) return idx;
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

        // Direct stream for non-proxy links to reduce latency
        if (!fixedAudio.includes('api.codetabs.com')) {
            audioSourceCache.set(cacheKey, fixedAudio);
            return fixedAudio;
        }

        // For the Drive proxy URL, streaming is faster than downloading the whole blob first.
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

    function formatTime(s) {
        const safe = Number.isFinite(s) ? s : 0;
        const m = Math.floor(safe / 60);
        const sc = Math.floor(safe % 60);
        return `${m}:${sc < 10 ? '0' + sc : sc}`;
    }

    function seekByProgress(percent) {
        if (!Number.isFinite(percent) || Number.isNaN(audio.duration) || audio.duration <= 0) return;
        const nextTime = Math.max(0, Math.min(audio.duration, (percent / 100) * audio.duration));
        audio.currentTime = nextTime;
        $('#time-now').text(formatTime(nextTime));
        if ($('#album-trigger').hasClass('show-lyrics')) {
            updateLyricsUI(nextTime);
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

    function renderCopyright() {
        const $list = $('#dynamic-copy-list').empty();
        playlistData.forEach((s, i) => {
            $list.append(`
                <div class="copy-item">
                    <span class="copy-title">${i + 1}. ${escapeHtml(s.title || '')}</span>
                    <span style="font-size:0.75rem; opacity:0.6;">${escapeHtml(s.artist || (appSettings && appSettings.defaultArtist) || 'Andre Youth')}</span>
                </div>
            `);
        });
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
        if (!s || !s.url || failedTitles.has(s.title)) {
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

        const fixedAudio = MusicEngine.fixUrl(s.url, 'audio');
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

            chatDb.limitToLast(30).on('child_added', (snap) => {
                const key = snap.key;
                const m = snap.val();
                const isMe = m.sender === userId;
                const iLike = myLikedMsgs.includes(key);
                $('#chat-messages').append(`
                    <div class="msg-row">
                        <div class="msg-bubble-wrap ${isMe ? 'me' : 'other'}">
                            <div class="message ${isMe ? 'me' : 'other'}" style="background:${isMe ? 'var(--primary)' : '#fff'}; color:${isMe ? '#fff' : '#333'}; padding:10px 15px; border-radius:15px;">${escapeHtml(m.text || '')}</div>
                            <button class="msg-like-btn ${iLike ? 'liked' : ''}" data-key="${key}">
                                <i class="${iLike ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                                <span class="like-count">${m.likeCount || ''}</span>
                            </button>
                        </div>
                    </div>`);
                const viewport = $('.chat-viewport')[0];
                if (viewport) viewport.scrollTop = viewport.scrollHeight;
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

    async function fetchPlaylist() {
        if (!ENABLE_REMOTE_PLAYLIST_SYNC) return;
        try {
            if (!playlistData.length || playlistData.length <= 1) {
                $('#disp-title').text('불러오는 중...');
            }

            const payload = await fetchBootstrapPayload({ includeLyrics: false, lyricsLimit: 0 });
            const data = payload && Array.isArray(payload.songs) ? payload.songs : [];

            if (payload && payload.settings) {
                applyAppSettings(payload.settings);
            }

            if (Array.isArray(data) && data.length > 0) {
                // If it was empty or 1-song fallback, replace immediately
                const wasMinimal = playlistData.length <= 1;
                const currentTitle = playlistData[curIdx]?.title;
                
                playlistData = data;
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
        if (isNaN(audio.duration)) return;
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
    $('#progress-bar').on('input change', function() {
        if (Number.isNaN(audio.duration) || audio.duration <= 0) return;
        const percent = parseFloat($(this).val());
        seekByProgress(percent);
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
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
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
                        playlistData = payload.songs;
                        writePlaylistCache({
                            songs: payload.songs,
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

