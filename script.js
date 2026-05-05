$(document).ready(function () {
    // 1. Firebase Config
    const firebaseConfig = {
        apiKey: "AIzaSyDt1XdEfx760ojnETRw-HYqJQOP8GK5fXE",
        authDomain: "busan-youth-player.firebaseapp.com",
        databaseURL: "https://busan-youth-player-default-rtdb.firebaseio.com",
        projectId: "busan-youth-player",
        storageBucket: "busan-youth-player.firebasestorage.app",
        messagingSenderId: "406016035492",
        appId: "1:406016035492:web:e3d03145aefa945c707431"
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    const playlistRef = db.ref('users/playlist');
    const settingsRef = db.ref('users/appSettings');
    const chatRef = db.ref('messages');
    const inqRef = db.ref('users/inquiries');

    // 2. State
    let playlistData = [];
    let curIdx = 0;
    let isShuffle = false;
    let repeatMode = 0;
    let isScrubbing = false;
    let currentLyrics = [];
    let lastActiveLyricIdx = -1;
    let favorites = JSON.parse(localStorage.getItem('andre_favs')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatUserId', userId);

    const audio = document.getElementById('audio-engine');
    const fallbackCover = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=60';

    // 3. Core Logic
    function init() {
        bindEvents();
        fetchData();
        const vol = localStorage.getItem('player_vol') || 80;
        $('#volume-slider').val(vol);
        audio.volume = vol / 100;

        window.closeAllModals = () => {
            $('#modal-container').removeClass('active');
            $('.floating-popup').removeClass('active');
            chatRef.off('child_added');
        };
    }

    function fetchData() {
        playlistRef.on('value', (snapshot) => {
            let data = snapshot.val();
            if (data && typeof data === 'object' && !Array.isArray(data)) data = Object.values(data);
            playlistData = data || [];
            renderPlaylist();
            if (playlistData.length > 0 && audio.src === "") loadSong(0, false);
        });

        settingsRef.on('value', (snapshot) => {
            const settings = snapshot.val();
            if (settings) {
                if (settings.playlistSubtitle) $('#top-subtitle').text(settings.playlistSubtitle);
                if (settings.themePrimary) document.documentElement.style.setProperty('--primary', settings.themePrimary);
            }
        });
    }

    async function loadSong(index, shouldPlay = true) {
        if (!playlistData.length || index < 0 || index >= playlistData.length) return;
        curIdx = index;
        const song = playlistData[curIdx];
        
        $('#disp-title').text(song.title || 'Untitled');
        $('#disp-artist').text(song.artist || 'Unknown Artist');
        
        const coverUrl = MusicEngine.fixUrl(song.cover || song.profile, 'image') || fallbackCover;
        $('#artwork').attr('src', coverUrl);
        $('#app-background').css('background-image', `url(${coverUrl})`);
        
        // Lyrics Fix: Properly handle lyrics load
        const lrc = song.lyricsData || song.lyrics || "";
        currentLyrics = MusicEngine.parseLyrics(lrc);
        lastActiveLyricIdx = -1;
        renderLyrics();

        const audioUrl = MusicEngine.fixUrl(song.url || song.audioUrl, 'audio');
        audio.src = audioUrl;
        audio.load();

        updateActiveInList();
        syncFavoriteState();

        if (shouldPlay) {
            try { await audio.play(); $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>'); }
            catch (e) { $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); }
        }
    }

    function renderLyrics() {
        const $scroll = $('#lyrics-scroll').empty();
        if (!currentLyrics.length) {
            $scroll.append('<div class="lyric-line no-data">가사가 없습니다.</div>');
            return;
        }
        currentLyrics.forEach((l, i) => {
            $scroll.append(`<div class="lyric-line" id="lrc-${i}" data-time="${l.time}">${l.text}</div>`);
        });
        $('#lyrics-scroll').scrollTop(0);
    }

    function updateLyricsSync(time) {
        if (!currentLyrics.length) return;
        let activeIdx = -1;
        for (let i = 0; i < currentLyrics.length; i++) {
            if (time >= currentLyrics[i].time) activeIdx = i;
            else break;
        }
        if (activeIdx !== -1 && activeIdx !== lastActiveLyricIdx) {
            $('.lyric-line').removeClass('active');
            const $active = $(`#lrc-${activeIdx}`).addClass('active');
            lastActiveLyricIdx = activeIdx;
            const container = $('#lyrics-scroll')[0];
            if (container && $active.length) {
                const targetScroll = $active[0].offsetTop - (container.offsetHeight / 2) + 20;
                container.scrollTo({ top: targetScroll, behavior: 'smooth' });
            }
        }
    }

    function renderPlaylist() {
        const $container = $('#song-list-container').empty();
        playlistData.forEach((song, i) => {
            const cover = MusicEngine.fixUrl(song.cover || song.profile, 'image') || fallbackCover;
            $container.append(`
                <div class="song-item ${i === curIdx ? 'active' : ''}" data-index="${i}">
                    <img src="${cover}" alt="cover">
                    <div class="song-item-info">
                        <h4>${song.title || 'Untitled'}</h4>
                        <p>${song.artist || 'Unknown'}</p>
                    </div>
                </div>
            `);
        });
    }

    function updateActiveInList() {
        $('.song-item').removeClass('active').eq(curIdx).addClass('active');
    }

    function next() {
        let n = curIdx + 1;
        if (isShuffle) n = Math.floor(Math.random() * playlistData.length);
        if (n >= playlistData.length) n = 0;
        loadSong(n, true);
    }

    function prev() {
        let p = curIdx - 1;
        if (p < 0) p = playlistData.length - 1;
        loadSong(p, true);
    }

    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sc = Math.floor(s % 60);
        return `${m}:${sc < 10 ? '0' + sc : sc}`;
    }

    function syncFavoriteState() {
        const song = playlistData[curIdx];
        const isFav = song && favorites.includes(song.title);
        $('#btn-scrap').find('i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        $('#btn-scrap').css('color', isFav ? 'var(--primary)' : 'white');
    }

    // 4. Events
    function bindEvents() {
        // Playback
        $('#btn-play-pause').on('click', () => {
            if (audio.paused) { audio.play(); $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>'); }
            else { audio.pause(); $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); }
        });
        $('#btn-next').on('click', next);
        $('#btn-prev').on('click', prev);

        // Progress
        $('#progress-bar-area').on('mousedown touchstart', (e) => { isScrubbing = true; handleSeek(e); });
        $(document).on('mousemove touchmove', (e) => { if (isScrubbing) handleSeek(e); });
        $(document).on('mouseup touchend', () => { isScrubbing = false; });
        audio.ontimeupdate = () => { if (!isScrubbing) updateProgressUI(); updateLyricsSync(audio.currentTime); };

        function handleSeek(e) {
            if (isNaN(audio.duration)) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const rect = $('#progress-bar-area')[0].getBoundingClientRect();
            let pos = (clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));
            audio.currentTime = pos * audio.duration;
            updateProgressUI();
        }

        function updateProgressUI() {
            if (isNaN(audio.duration)) return;
            const per = (audio.currentTime / audio.duration) * 100;
            $('#progress-fill').css('width', per + '%');
            $('#progress-knob').css('left', per + '%');
            $('#time-now').text(formatTime(audio.currentTime));
            $('#time-total').text(formatTime(audio.duration));
        }

        // Shuffle/Repeat
        $('#btn-shuffle').on('click', function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle).css('color', isShuffle ? 'var(--primary)' : 'white'); });
        $('#btn-repeat').on('click', function() {
            repeatMode = (repeatMode + 1) % 3;
            const $i = $(this).find('i');
            if (repeatMode === 0) { $i.attr('class', 'fa-solid fa-repeat'); $(this).css('color', 'white'); }
            else if (repeatMode === 1) { $i.attr('class', 'fa-solid fa-repeat'); $(this).css('color', 'var(--primary)'); }
            else { $i.attr('class', 'fa-solid fa-repeat-1'); $(this).css('color', 'var(--primary)'); }
        });
        audio.onended = () => { if (repeatMode === 2) { audio.currentTime = 0; audio.play(); } else if (repeatMode === 1 || curIdx < playlistData.length - 1) next(); };

        // Lyrics/Artwork toggle
        $('#album-trigger').on('click', () => { $('#artwork').toggleClass('lyrics-mode'); $('#lyrics-overlay').toggleClass('active'); });

        // Volume Popover
        $('#btn-vol-pop').on('click', (e) => { e.stopPropagation(); $('#volume-popover').toggleClass('active'); });
        $(document).on('click', (e) => { if (!$(e.target).closest('.vol-pop-vertical').length) $('#volume-popover').removeClass('active'); });
        $('#volume-slider').on('input', function() { const v = $(this).val(); audio.volume = v / 100; localStorage.setItem('player_vol', v); });

        // Modals
        $('#btn-open-chat').on('click', () => {
            $('#modal-container').addClass('active'); $('#chat-popup').addClass('active');
            chatRef.limitToLast(50).on('child_added', (snap) => {
                const m = snap.val(); if (!m) return;
                const html = `<div class="msg-bubble ${m.sender === userId ? 'mine' : ''}">${m.text}</div>`;
                $('#chat-messages').append(html).scrollTop($('#chat-messages')[0].scrollHeight);
            });
        });
        $('#btn-inquiry').on('click', () => { $('#modal-container').addClass('active'); $('#inquiry-popup').addClass('active'); });
        $('#btn-admin-login').on('click', () => { $('#modal-container').addClass('active'); $('#admin-popup').addClass('active'); });

        $('#btn-send-chat').on('click', () => {
            const txt = $('#chat-input').val().trim(); if (!txt) return;
            chatRef.push({ text: txt, sender: userId, timestamp: Date.now() }); $('#chat-input').val('');
        });
        $('#chat-input').on('keypress', (e) => { if (e.which === 13) $('#btn-send-chat').click(); });

        $('#btn-submit-inquiry').on('click', async () => {
            const title = $('#inq-title').val().trim(), content = $('#inq-content').val().trim(), contact = $('#inq-contact').val().trim();
            if (!title || !content) return alert('제목과 내용을 입력해주세요.');
            try { await inqRef.push({ title, content, contact, timestamp: Date.now(), status: 'new' }); alert('문의가 성공적으로 전송되었습니다.'); $('#inq-title, #inq-content, #inq-contact').val(''); closeAllModals(); }
            catch (e) { alert('전송 중 오류 발생'); }
        });

        $('#btn-do-login').on('click', () => {
            const email = $('#admin-email').val(), pw = $('#admin-password').val();
            if (email === 'admin@andre.com' && pw === 'admin1234') { alert('인증 성공!'); $('#btn-go-admin').show(); }
            else alert('인증 정보 오류');
        });
        $('#btn-go-admin').on('click', () => window.location.href = 'admin.html');

        // Playlist Sheet
        $('#btn-open-list').on('click', () => $('#playlist-sheet').addClass('active'));
        $('#sheet-handle').on('click', () => $('#playlist-sheet').removeClass('active'));
        $(document).on('click', '.song-item', function() { loadSong($(this).data('index'), true); $('#playlist-sheet').removeClass('active'); });

        // Swipe sheet
        let tY = 0;
        $('#playlist-sheet').on('touchstart', (e) => tY = e.touches[0].clientY);
        $('#playlist-sheet').on('touchmove', (e) => { if (e.touches[0].clientY - tY > 100) $('#playlist-sheet').removeClass('active'); });

        // Scrap
        $('#btn-scrap').on('click', function() {
            const song = playlistData[curIdx]; if (!song) return;
            const idx = favorites.indexOf(song.title);
            if (idx === -1) favorites.push(song.title); else favorites.splice(idx, 1);
            localStorage.setItem('andre_favs', JSON.stringify(favorites)); syncFavoriteState();
        });
    }

    init();
});
