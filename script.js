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

    if (typeof firebase !== 'undefined' && !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = typeof firebase !== 'undefined' ? firebase.database() : null;

    const audio = document.getElementById('audio-engine');
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwqK78wbvPYHSxbwl6Fyu43ystWSU824EFiwM3ZJGvusGhQW99eWJBEUY1vrOub3sQTbg/exec";

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
            $area.append('<div class="lyric-line no-data">가사 데이터 형식이 맞지 않습니다.</div>');
            return;
        }

        currentLyrics.forEach((l, i) => {
            $area.append(`<div class="lyric-line" id="lyric-${i}" data-time="${l.time}">${escapeHtml(l.text)}</div>`);
        });

        $('.lyric-line').off('click').on('click', function(e) {
            e.stopPropagation();
            const time = parseFloat($(this).data('time'));
            if (!isNaN(time)) jumpToLyric(time);
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
        if (container && $activeLine[0]) {
            const lineOffset = $activeLine[0].offsetTop;
            const lineSize = $activeLine[0].offsetHeight;
            const containerSize = container.offsetHeight;
            const scrollTarget = lineOffset - (containerSize / 2) + (lineSize / 2);
            container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }
    }

    async function fetchPlaylist() {
        try {
            $('#disp-title').text('불러오는 중...');
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
                $('#disp-title').text('곡을 추가해주세요.');
            }
        } catch (error) {
            console.error('Playlist Fetch Error:', error);
            $('#disp-title').text('데이터 로드 실패');
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

        audio.src = fixedAudio;
        audio.removeAttribute('crossorigin');
        audio.load();

        setImageWithFallback($('#album-img'), fixedCover);
        setImageWithFallback($('#artist-avatar'), fixedCover);
        $('#bg-image').css('background-image', `url('${fixedCover}')`);
        $('#album-trigger').removeClass('show-lyrics').css('background-image', `url('${fixedCover}')`);
        $('#disp-title').text(s.title || 'Untitled');
        $('#disp-artist').text(s.artist || 'Andre Youth');

        if (s.lyricsData) {
            currentLyrics = MusicEngine.parseLyrics(s.lyricsData);
            renderLyrics();
        } else {
            $('#lyrics-scroll-area').html('<div class="lyric-line no-data">등록된 가사가 없습니다.</div>');
            currentLyrics = [];
        }

        render();
        syncHearts();

        if (play) {
            audio.play().catch(e => {
                console.error('Playback System Error:', e.name, e.message);
                if (e.name === 'NotAllowedError') {
                    $('#disp-title').text('화면을 클릭하면 재생됩니다.');
                }
            });
        }
    }

    function next() {
        const n = isShuffle ? getRandomPlayableIndex() : getNextPlayableIndex(curIdx + 1);
        if (n === -1) {
            $('#disp-title').text('재생 가능한 곡이 없습니다.');
            return;
        }
        load(n, true);
    }

    function prev() {
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

    if (typeof firebase !== 'undefined' && db) {
        const chatDb = db.ref('messages');
        $('#btn-send-chat').click(() => {
            const t = $('#chat-input').val().trim();
            if (t) {
                chatDb.push({ text: t, sender: userId, timestamp: Date.now(), likeCount: 0 });
                $('#chat-input').val('');
            }
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
            $('.chat-viewport').scrollTop($('.chat-viewport')[0].scrollHeight);
        });

        $(document).on('click', '.msg-like-btn', function() {
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

    audio.onended = () => repeatMode === 2 ? (audio.currentTime = 0, audio.play()) : next();
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
        const fmt = s => { const m = Math.floor(s / 60), sc = Math.floor(s % 60); return `${m}:${sc < 10 ? '0' + sc : sc}`; };
        $('#time-now').text(fmt(audio.currentTime));
        $('#time-total').text(fmt(audio.duration));

        if ($('#album-trigger').hasClass('show-lyrics')) {
            updateLyricsUI(audio.currentTime);
        }
    };

    $('#btn-vol-trigger').on('click touchstart', function(e) { e.stopPropagation(); openSb(); });
    $('#btn-vol-close').on('click touchstart', function(e) { e.stopPropagation(); $('#main-header').removeClass('mode-volume'); });
    $('#sb-volume-slider').on('input', function() { audio.volume = $(this).val() / 100; openSb(); });
    $('#btn-play-pause').on('click touchstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (audio.paused) audio.play();
        else audio.pause();
    });

    $('#btn-next').click(next);
    $('#btn-prev').click(prev);
    $('#btn-shuffle').click(function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle); });
    $('#btn-repeat').click(function() { repeatMode = (repeatMode + 1) % 3; $(this).toggleClass('active', repeatMode > 0); });
    $('#btn-scrap').click(() => {
        if (curIdx >= 0 && playlistData[curIdx]) toggleFav(playlistData[curIdx].title);
    });

    $('#btn-open-chat').click(() => $('#chat-overlay').addClass('active'));
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
    $('.close-x').click(function() { $(this).closest('.ios-popup').removeClass('active'); });

    $('#album-trigger').click(function() {
        $(this).toggleClass('show-lyrics');
        if ($(this).hasClass('show-lyrics')) {
            updateLyricsUI(audio.currentTime);
        }
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

    fetchPlaylist();
});
