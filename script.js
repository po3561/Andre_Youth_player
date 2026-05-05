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
    const chatRef = db.ref('chats');
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
    const userId = localStorage.getItem('player_uid') || ('user_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('player_uid', userId);

    const audio = document.getElementById('audio-engine');
    const fallbackCover = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=60';

    // 3. Core Logic
    function init() {
        bindEvents();
        fetchData();
        const vol = localStorage.getItem('player_vol') || 80;
        $('#volume-slider').val(vol);
        audio.volume = vol / 100;
        
        // Hide splash screen after initial load
        setTimeout(() => {
            $('#splash-screen').addClass('hidden');
        }, 1800);

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
        
        const coverUrl = (song.cover || song.profile) || fallbackCover;
        $('#artwork').attr('src', coverUrl);
        $('#app-background').css('background-image', `url(${coverUrl})`);
        
        const lrc = song.lyricsData || song.lyrics || "";
        currentLyrics = MusicEngine.parseLyrics(lrc);
        lastActiveLyricIdx = -1;
        renderLyrics();

        const audioUrl = MusicEngine.fixUrl(song.url || song.audioUrl, 'audio');
        audio.src = audioUrl;
        audio.load();

        updateActiveInList();
        syncFavoriteState();

        $('#song-loading-overlay').addClass('active');

        if (shouldPlay) {
            try { 
                await audio.play(); 
                $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>'); 
            }
            catch (e) { 
                $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); 
            }
        }
        $('#song-loading-overlay').removeClass('active');
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
            $('.lyric-line').removeClass('active near');
            const $active = $(`#lrc-${activeIdx}`).addClass('active');
            $(`#lrc-${activeIdx-1}, #lrc-${activeIdx+1}`).addClass('near');

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
            const isCurrent = i === curIdx;
            const cover = MusicEngine.fixUrl(song.cover || song.profile, 'image') || fallbackCover;
            const playingAni = isCurrent ? `<div class="playing-bars"><span></span><span></span><span></span></div>` : '';
            $container.append(`
                <div class="song-item ${isCurrent ? 'active' : ''}" data-index="${i}">
                    <img src="${cover}" alt="cover">
                    <div class="song-item-info">
                        <h4>${song.title || 'Untitled'}</h4>
                        <p>${song.artist || 'Unknown'}</p>
                    </div>
                    ${playingAni}
                </div>
            `);
        });
    }

    function updateActiveInList() {
        renderPlaylist(); // Simplified: just re-render to update bars
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

    window.toggleAuthMode = (isSignup) => {
        if (isSignup) {
            $('#admin-popup-title').text('관리자 회원가입');
            $('#admin-auth-form').hide();
            $('#admin-signup-form').show();
        } else {
            $('#admin-popup-title').text('관리자 인증');
            $('#admin-auth-form').show();
            $('#admin-signup-form').hide();
        }
    };

    // 4. Events
    function bindEvents() {
        $('#btn-play-pause').on('click', () => {
            if (audio.paused) { audio.play(); $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>'); }
            else { audio.pause(); $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); }
        });
        $('#btn-next').on('click', next);
        $('#btn-prev').on('click', prev);

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

        $('#btn-shuffle').on('click', function() {
            isShuffle = !isShuffle;
            $(this).toggleClass('active', isShuffle).css('color', isShuffle ? 'var(--primary)' : 'white');
            $(this).html('<i class="fa-solid fa-shuffle"></i>');
        });

        $('#btn-repeat').on('click', function() {
            repeatMode = (repeatMode + 1) % 3;
            const $btn = $(this);
            if (repeatMode === 0) $btn.html('<i class="fa-solid fa-repeat"></i>').css('color', 'white');
            else if (repeatMode === 1) $btn.html('<i class="fa-solid fa-repeat"></i>').css('color', 'var(--primary)');
            else $btn.html('<i class="fa-solid fa-repeat-1"></i>').css('color', 'var(--primary)');
        });

        audio.onended = () => {
            if (repeatMode === 2) { audio.currentTime = 0; audio.play(); }
            else if (repeatMode === 1 || curIdx < playlistData.length - 1) next();
        };

        $('#album-trigger').on('click', () => {
            $('#artwork').toggleClass('lyrics-mode');
            $('#lyrics-overlay').toggleClass('active');
            renderLyrics();
        });

        $('#btn-vol-pop').on('click', (e) => { e.stopPropagation(); $('.full-width-vol-container').toggleClass('active'); });
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.full-width-vol-container, #btn-vol-pop').length) $('.full-width-vol-container').removeClass('active');
        });
        
        $('#volume-slider').on('input', function() {
            const v = $(this).val();
            audio.volume = v / 100;
            localStorage.setItem('player_vol', v);
        });

        $('#btn-open-chat').on('click', () => {
            $('#modal-container, #chat-popup').addClass('active');
            $('#chat-messages').empty();
            const query = chatRef.limitToLast(50);
            query.off('child_added');
            query.on('child_added', (snap) => {
                const m = snap.val(); if (!m) return;
                const html = `<div class="msg-bubble ${m.sender === userId ? 'mine' : ''}">${m.text}</div>`;
                $('#chat-messages').append(html).scrollTop($('#chat-messages')[0].scrollHeight);
            });
        });

        $('#btn-inquiry').on('click', () => $('#modal-container, #inquiry-popup').addClass('active'));
        $('#btn-admin-login').on('click', () => $('#modal-container, #admin-popup').addClass('active'));

        $('#btn-send-chat').on('click', () => {
            const txt = $('#chat-input').val().trim(); if (!txt) return;
            chatRef.push({ text: txt, sender: userId, timestamp: Date.now() }); 
            $('#chat-input').val('');
        });

        $('#chat-input').on('keydown', function(e) {
            if (e.which === 13) {
                e.preventDefault();
                $('#btn-send-chat').click();
            }
        });

        $('#btn-submit-inquiry').on('click', async () => {
            const title = $('#inq-title').val().trim(), content = $('#inq-content').val().trim(), contact = $('#inq-contact').val().trim();
            if (!title || !content) return alert('제목과 내용을 입력해주세요.');
            try { 
                await inqRef.push({ title, content, contact, timestamp: firebase.database.ServerValue.TIMESTAMP, status: 'new' }); 
                alert('문의 전송 완료!'); $('#inq-title, #inq-content, #inq-contact').val(''); closeAllModals(); 
            }
            catch (e) { alert('전송 실패: ' + e.message); }
        });

        $('#btn-do-login').on('click', () => {
            let email = $('#admin-email').val().trim(), pw = $('#admin-password').val().trim();
            if (!email || !pw) return alert('정보를 입력해주세요.');
            if (!email.includes('@')) email += '@admin.com';
            if (typeof firebase.auth !== 'function') {
                return alert('인증 시스템을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
            }
            firebase.auth().signInWithEmailAndPassword(email, pw)
                .then((userCredential) => {
                    localStorage.setItem('adminUser', JSON.stringify({ uid: userCredential.user.uid, email: userCredential.user.email, isApproved: true, loginTime: Date.now() }));
                    alert('관리자 인증 성공!'); window.location.href = 'admin.html';
                })
                .catch(err => alert('인증 실패: ' + err.message));
        });

        $('#btn-open-list').on('click', () => $('#playlist-sheet').addClass('active'));
        $('#sheet-handle').on('click', () => $('#playlist-sheet').removeClass('active'));
        $(document).on('click', '.song-item', function() { loadSong($(this).data('index'), true); $('#playlist-sheet').removeClass('active'); });

        $('#btn-scrap').on('click', function() {
            const song = playlistData[curIdx]; if (!song) return;
            const idx = favorites.indexOf(song.title);
            if (idx === -1) favorites.push(song.title); else favorites.splice(idx, 1);
            localStorage.setItem('andre_favs', JSON.stringify(favorites)); syncFavoriteState();
        });

        $(document).on('keydown', (e) => {
            if ($(e.target).is('input, textarea')) return;
            switch(e.code) {
                case 'Space': e.preventDefault(); $('#btn-play-pause').click(); break;
                case 'ArrowRight': audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); break;
                case 'ArrowLeft': audio.currentTime = Math.max(0, audio.currentTime - 10); break;
                case 'ArrowUp': e.preventDefault(); let vUp = Math.min(1, audio.volume + 0.1); audio.volume = vUp; $('#volume-slider').val(vUp * 100); break;
                case 'ArrowDown': e.preventDefault(); let vDown = Math.max(0, audio.volume - 0.1); audio.volume = vDown; $('#volume-slider').val(vDown * 100); break;
                case 'KeyM': audio.muted = !audio.muted; break;
                case 'KeyS': $('#btn-shuffle').click(); break;
                case 'KeyR': $('#btn-repeat').click(); break;
            }
        });
    }

    init();
});
