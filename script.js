$(document).ready(function () {
    // 1. Configuration & Firebase Initialization
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

    // 2. Global State
    let playlistData = [];
    let curIdx = 0;
    let isShuffle = false;
    let repeatMode = 0; // 0: None, 1: All, 2: One
    let isScrubbing = false;
    let currentLyrics = [];
    let lastActiveLyricIdx = -1;
    let favorites = JSON.parse(localStorage.getItem('andre_favs')) || [];

    const audio = document.getElementById('audio-engine');
    const fallbackCover = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=60';

    // 3. Core Functions
    function init() {
        bindEvents();
        fetchData();
        // Load volume from local storage
        const vol = localStorage.getItem('player_vol') || 80;
        $('#volume-slider').val(vol);
        audio.volume = vol / 100;
    }

    function fetchData() {
        // Real-time listener for playlist
        playlistRef.on('value', (snapshot) => {
            let data = snapshot.val();
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                data = Object.values(data);
            }
            playlistData = data || [];
            renderPlaylist();
            
            // Sync current song if it exists in new data, else reset
            if (playlistData.length > 0 && curIdx === -1) {
                loadSong(0, false);
            }
        });

        // App Settings sync
        settingsRef.on('value', (snapshot) => {
            const settings = snapshot.val();
            if (settings) {
                if (settings.playlistSubtitle) $('#top-title').text(settings.playlistSubtitle);
                if (settings.themePrimary) document.documentElement.style.setProperty('--primary', settings.themePrimary);
            }
        });
    }

    async function loadSong(index, shouldPlay = true) {
        if (!playlistData.length || index < 0 || index >= playlistData.length) return;
        
        curIdx = index;
        const song = playlistData[curIdx];
        
        // UI Updates
        $('#disp-title').text(song.title || 'Untitled');
        $('#disp-artist').text(song.artist || 'Unknown Artist');
        
        const coverUrl = MusicEngine.fixUrl(song.cover || song.profile, 'image') || fallbackCover;
        $('#artwork').attr('src', coverUrl);
        $('#app-background').css('background-image', `url(${coverUrl})`);
        
        // Lyrics initialization
        const lrc = song.lyricsData || song.lyrics || "";
        currentLyrics = MusicEngine.parseLyrics(lrc);
        renderLyrics();

        // Audio Source
        const audioUrl = MusicEngine.fixUrl(song.url || song.audioUrl, 'audio');
        audio.src = audioUrl;
        audio.load();

        updateActiveInList();
        syncFavoriteState();

        if (shouldPlay) {
            try {
                await audio.play();
                $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
            } catch (e) {
                console.warn("Playback blocked or failed:", e);
                $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
            }
        }
    }

    function renderPlaylist() {
        const $container = $('#song-list-container').empty();
        playlistData.forEach((song, i) => {
            const isActive = i === curIdx ? 'active' : '';
            const cover = MusicEngine.fixUrl(song.cover || song.profile, 'image') || fallbackCover;
            $container.append(`
                <div class="song-item ${isActive}" data-index="${i}">
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

    function renderLyrics() {
        const $scroll = $('#lyrics-scroll').empty();
        if (!currentLyrics.length) {
            $scroll.append('<div class="lyric-line no-data">가사가 없습니다.</div>');
            return;
        }
        currentLyrics.forEach((l, i) => {
            $scroll.append(`<div class="lyric-line" id="lrc-${i}" data-time="${l.time}">${l.text}</div>`);
        });
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

    function syncFavoriteState() {
        const song = playlistData[curIdx];
        const isFav = song && favorites.includes(song.title);
        $('#btn-scrap').find('i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        $('#btn-scrap').css('color', isFav ? 'var(--primary)' : 'white');
    }

    // 4. Event Binding
    function bindEvents() {
        // Play/Pause
        $('#btn-play-pause').on('click', function() {
            if (audio.paused) {
                audio.play();
                $(this).html('<i class="fa-solid fa-pause"></i>');
            } else {
                audio.pause();
                $(this).html('<i class="fa-solid fa-play"></i>');
            }
        });

        $('#btn-next').on('click', next);
        $('#btn-prev').on('click', prev);

        // Progress Bar
        $('#progress-bar-area').on('mousedown touchstart', (e) => { isScrubbing = true; handleSeek(e); });
        $(document).on('mousemove touchmove', (e) => { if (isScrubbing) handleSeek(e); });
        $(document).on('mouseup touchend', () => { isScrubbing = false; });

        function handleSeek(e) {
            if (isNaN(audio.duration)) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const rect = $('#progress-bar-area')[0].getBoundingClientRect();
            let pos = (clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));
            audio.currentTime = pos * audio.duration;
            updateProgressUI();
        }

        audio.ontimeupdate = () => {
            if (!isScrubbing) updateProgressUI();
            updateLyricsSync(audio.currentTime);
        };

        function updateProgressUI() {
            if (isNaN(audio.duration)) return;
            const per = (audio.currentTime / audio.duration) * 100;
            $('#progress-fill').css('width', per + '%');
            $('#progress-knob').css('left', per + '%');
            $('#time-now').text(formatTime(audio.currentTime));
            $('#time-total').text(formatTime(audio.duration));
        }

        function formatTime(s) {
            const m = Math.floor(s / 60);
            const sc = Math.floor(s % 60);
            return `${m}:${sc < 10 ? '0' + sc : sc}`;
        }

        // Shuffle & Repeat
        $('#btn-shuffle').on('click', function() {
            isShuffle = !isShuffle;
            $(this).toggleClass('active', isShuffle);
            $(this).css('color', isShuffle ? 'var(--primary)' : 'white');
        });

        $('#btn-repeat').on('click', function() {
            repeatMode = (repeatMode + 1) % 3;
            const $i = $(this).find('i');
            if (repeatMode === 0) { $i.attr('class', 'fa-solid fa-repeat'); $(this).css('color', 'white'); }
            else if (repeatMode === 1) { $i.attr('class', 'fa-solid fa-repeat'); $(this).css('color', 'var(--primary)'); }
            else { $i.attr('class', 'fa-solid fa-repeat-1'); $(this).css('color', 'var(--primary)'); }
        });

        audio.onended = () => {
            if (repeatMode === 2) { audio.currentTime = 0; audio.play(); }
            else if (repeatMode === 1 || curIdx < playlistData.length - 1) next();
        };

        // Lyrics Toggle
        $('#album-trigger').on('click', function() {
            $(this).find('#artwork').toggleClass('lyrics-mode');
            $('#lyrics-overlay').toggleClass('active');
        });

        // Volume Popover Toggle
        $('#btn-vol-pop').on('click', function(e) {
            e.stopPropagation();
            $('#volume-popover').toggleClass('active');
        });

        $(document).on('click', function() {
            $('#volume-popover').removeClass('active');
        });

        $('#volume-popover').on('click', function(e) { e.stopPropagation(); });

        $('#volume-slider').on('input', function() {
            const v = $(this).val();
            audio.volume = v / 100;
            localStorage.setItem('player_vol', v);
        });


        // Playlist Sheet
        $('#btn-open-list').on('click', () => $('#playlist-sheet').addClass('active'));
        $('#sheet-handle').on('click', () => $('#playlist-sheet').removeClass('active'));
        
        // Swipe to close sheet
        let touchStartY = 0;
        $('#playlist-sheet').on('touchstart', (e) => { touchStartY = e.touches[0].clientY; });
        $('#playlist-sheet').on('touchmove', (e) => {
            const diff = e.touches[0].clientY - touchStartY;
            if (diff > 100) $('#playlist-sheet').removeClass('active');
        });

        $(document).on('click', '.song-item', function() {
            const idx = $(this).data('index');
            loadSong(idx, true);
            $('#playlist-sheet').removeClass('active');
        });

        // Chat Logic
        const chatRef = db.ref('messages');
        let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('chatUserId', userId);

        $('#btn-open-chat').on('click', () => {
            $('#chat-overlay').addClass('active');
            chatRef.limitToLast(50).off('child_added').on('child_added', (snap) => {
                const m = snap.val();
                if (!m) return;
                const isMine = m.sender === userId;
                const html = `<div class="msg-bubble ${isMine ? 'mine' : ''}">${m.text}</div>`;
                $('#chat-messages').append(html);
                $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight);
            });
        });

        $('#btn-close-chat').on('click', () => {
            $('#chat-overlay').removeClass('active');
        });

        $('#btn-send-chat').on('click', () => {
            const txt = $('#chat-input').val().trim();
            if (!txt) return;
            chatRef.push({ text: txt, sender: userId, timestamp: Date.now() });
            $('#chat-input').val('');
        });

        $('#chat-input').on('keypress', (e) => { if (e.which === 13) $('#btn-send-chat').click(); });


        // Favorites
        $('#btn-scrap').on('click', function() {
            const song = playlistData[curIdx];
            if (!song) return;
            const idx = favorites.indexOf(song.title);
            if (idx === -1) favorites.push(song.title);
            else favorites.splice(idx, 1);
            localStorage.setItem('andre_favs', JSON.stringify(favorites));
            syncFavoriteState();
        });

        // Other buttons
        $('#btn-inquiry').on('click', () => {
            window.location.href = "mailto:ej210651392@gmail.com?subject=Andre Youth Player 문의";
        });
        $('#btn-admin-login').on('click', () => {
             window.location.href = 'admin.html';
        });
    }

    init();
});
