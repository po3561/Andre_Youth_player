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
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzpgVGfUET30p03Y2RD17ULZHUjrPROqaxPCcSQmqnbnMFQVqMSdXM9T0_M5eC68oad9g/exec";
    const ENABLE_REMOTE_PLAYLIST_SYNC = false;
    const PLAYLIST_CACHE_KEY = 'andreYouthPlaylistCache_v4';
    const PLAYLIST_CACHE_TTL = 1000 * 60 * 30;

    let curIdx = -1;
    let isShuffle = false;
    let repeatMode = 0;
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    let myLikedMsgs = JSON.parse(localStorage.getItem('myLikedMsgs')) || [];
    let playlistData = [];
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
            if (!parsed || !Array.isArray(parsed.data)) return null;
            if (!parsed.ts || Date.now() - parsed.ts > PLAYLIST_CACHE_TTL) return null;
            return parsed.data;
        } catch (error) {
            return null;
        }
    }

    function writePlaylistCache(data) {
        try {
            localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (error) {
            // Ignore storage pressure.
        }
    }

    function hydratePlaylistCache() {
        const cached = readPlaylistCache();
        const fallback = Array.isArray(window.PUBLIC_PLAYLIST) ? window.PUBLIC_PLAYLIST : [];
        const source = cached && cached.length ? cached : fallback;
        if (!source.length) return false;
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
            .filter(item => item.song && !failedTitles.has(item.song.title))
            .map(item => item.index);
    }

    function getNextPlayableIndex(startIndex) {
        if (!playlistData.length) return -1;
        for (let step = 0; step < playlistData.length; step++) {
            const idx = (startIndex + step + playlistData.length) % playlistData.length;
            if (!failedTitles.has(playlistData[idx]?.title)) return idx;
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
        return playable[Math.floor(Math.random() * playable.length)];
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
        if (audioSourceCache.has(cacheKey)) {
            return audioSourceCache.get(cacheKey);
        }

        if (!fixedAudio.includes('api.codetabs.com')) {
            audioSourceCache.set(cacheKey, fixedAudio);
            return fixedAudio;
        }

        const response = await fetch(fixedAudio, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Audio fetch failed: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        audioSourceCache.set(cacheKey, objectUrl);
        return objectUrl;
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
                    <span style="font-size:0.75rem; opacity:0.6;">Andre Youth</span>
                </div>
            `);
        });
    }

    function renderLyrics() {
        const $area = $('#lyrics-scroll-area').empty();
        if (currentLyrics.length === 0) {
            $area.append('<div class="lyric-line no-data">媛???곗씠???뺤떇??留욎? ?딆뒿?덈떎.</div>');
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

        let activeIdx = -1;
        for (let i = 0; i < currentLyrics.length; i++) {
            if (currentTime >= currentLyrics[i].time) activeIdx = i;
            else break;
        }

        if (activeIdx === -1) return;
        $('.lyric-line').removeClass('active');
        const $activeLine = $(`#lyric-${activeIdx}`).addClass('active');

        const container = $('.lyrics-container')[0];
        if (lyricsAutoScrollEnabled && container && $activeLine[0]) {
            const lineOffset = $activeLine[0].offsetTop;
            const lineSize = $activeLine[0].offsetHeight;
            const containerSize = container.offsetHeight;
            const scrollTarget = lineOffset - (containerSize / 2) + (lineSize / 2);
            beginProgrammaticLyricsScroll();
            container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }
    }

    async function fetchPlaylist() {
        try {
            $('#disp-title').text('遺덈윭?ㅻ뒗 以?..');
            const response = await fetch(`${GAS_URL}?v=${Date.now()}`);
            const data = await response.json();

            if (data && data.length > 0) {
                playlistData = data;
                failedTitles.clear();
                render();
                renderCopyright();
                const firstPlayable = getNextPlayableIndex(0);
                load(firstPlayable === -1 ? 0 : firstPlayable);
            } else {
                $('#disp-title').text('怨≪쓣 異붽??댁＜?몄슂.');
            }
        } catch (error) {
            console.error('Playlist Fetch Error:', error);
            $('#disp-title').text('?곗씠??濡쒕뱶 ?ㅽ뙣');
        }
    }

    function load(i, play = false) {
        if (i < 0 || i >= playlistData.length) return;

        const s = playlistData[i];
        if (s?.title && failedTitles.has(s.title)) {
            const fallbackIndex = isShuffle ? getRandomPlayableIndex() : getNextPlayableIndex(i + 1);
            if (fallbackIndex !== -1 && fallbackIndex !== i) return load(fallbackIndex, play);
        }

        curIdx = i;

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

        if (s.lyricsData) {
            currentLyrics = MusicEngine.parseLyrics(s.lyricsData);
            renderLyrics();
        } else {
            $('#lyrics-scroll-area').html('<div class="lyric-line no-data">?깅줉??媛?ш? ?놁뒿?덈떎.</div>');
            currentLyrics = [];
        }

        render();
        syncHearts();

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
                    await audio.play().catch(e => {
                        console.error('Playback System Error:', e.name, e.message);
                        if (e.name === 'NotAllowedError') {
                            $('#disp-title').text('?붾㈃???대┃?섎㈃ ?ъ깮?⑸땲??');
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
                    $('#disp-title').text('?ъ깮 媛?ν븳 怨≪씠 ?놁뒿?덈떎.');
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
            $('#disp-title').text('?ъ깮 媛?ν븳 怨≪씠 ?놁뒿?덈떎.');
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
            $('#disp-title').text('?ъ깮 媛?ν븳 怨≪씠 ?놁뒿?덈떎.');
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
                    <div class="msg-row" style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; width:100%;">
                        <div style="display:flex; align-items:flex-end; max-width:85%; flex-direction:${isMe ? 'row-reverse' : 'row'};">
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
            if (!playlistData.length) {
                $('#disp-title').text('遺덈윭?ㅻ뒗 以?..');
            }

            const response = await fetch(`${GAS_URL}?v=${Date.now()}`, { cache: 'no-store' });
            const data = await response.json();

            if (Array.isArray(data) && data.length > 0) {
                const currentTitle = playlistData[curIdx]?.title;
                playlistData = data;
                writePlaylistCache(data);
                failedTitles.clear();
                render();
                renderCopyright();

                if (currentTitle) {
                    const preservedIndex = playlistData.findIndex(song => song?.title === currentTitle);
                    if (preservedIndex !== -1) {
                        curIdx = preservedIndex;
                        render();
                        syncHearts();
                        return;
                    }
                }

                const firstPlayable = getNextPlayableIndex(0);
                load(firstPlayable === -1 ? 0 : firstPlayable, false);
            } else if (!playlistData.length) {
                $('#disp-title').text('怨≪쓣 異붽??댁＜?몄슂.');
            }
        } catch (error) {
            console.error('Playlist Fetch Error:', error);
            if (!playlistData.length) {
                $('#disp-title').text('?곗씠??濡쒕뱶 ?ㅽ뙣');
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
            $('#disp-title').text('?ъ깮 媛?ν븳 怨≪씠 ?놁뒿?덈떎.');
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

    $('#btn-next').click(next);
    $('#btn-prev').click(prev);
    $('#btn-shuffle').click(function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle); });
    $('#btn-repeat').click(function() { repeatMode = (repeatMode + 1) % 3; $(this).toggleClass('active', repeatMode > 0); });
    $('#btn-scrap').click(() => {
        if (curIdx >= 0 && playlistData[curIdx]) toggleFav(playlistData[curIdx].title);
    });

    $('#btn-open-chat').off('click').on('click', async () => {
        $('#chat-overlay').addClass('active');
        if (!chatDb) {
            $('#chat-messages').html('<div class="chat-loading">梨꾪똿??遺덈윭?ㅻ뒗 以?..</div>');
            try {
                await ensureChatDb();
            } catch (error) {
                console.error('Chat Init Error:', error);
                $('#chat-messages').html('<div class="chat-loading">梨꾪똿??遺덈윭?ㅼ? 紐삵뻽?듬땲??</div>');
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
        if (diff > 40) $('#sheet').addClass('expanded');
        else if (diff < -40) $('#sheet').removeClass('expanded');
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
    if (ENABLE_REMOTE_PLAYLIST_SYNC) {
        requestAnimationFrame(() => {
            fetchPlaylist();
        });
    }
});

