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

    const audio = document.getElementById('audio-engine');
    const fallbackCover = MusicEngine.placeholderImage;

    // 2. State
    let playlistData = [];
    let curIdx = 0;
    let isShuffle = false;
    let repeatMode = 0; // 0: No Repeat, 1: Repeat All, 2: Repeat One
    let isScrubbing = false;
    let currentLyrics = [];
    let lastActiveLyricIdx = -1;
    let favorites = JSON.parse(localStorage.getItem('andre_favs')) || [];
    const userId = localStorage.getItem('player_uid') || ('user_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('player_uid', userId);

    // 3. Functions
    function init() {
        bindEvents();
        fetchData();
        const vol = localStorage.getItem('player_vol') || 80;
        $('#volume-slider').val(vol);
        if (audio) audio.volume = vol / 100;
        
        setTimeout(() => {
            $('#splash-screen').addClass('hidden');
            setTimeout(() => $('#splash-screen').hide(), 800);
        }, 1800);
    }

    async function fetchData() {
        playlistRef.on('value', snap => {
            const data = snap.val();
            if (data) {
                playlistData = Array.isArray(data) ? data : Object.values(data);
                renderPlaylist();
                if (playlistData.length > 0) loadSong(0, false);
            }
        });
    }

    async function loadSong(index, shouldPlay = false) {
        if (!playlistData[index]) return;
        curIdx = index;
        const song = playlistData[index];

        $('#disp-title').text(song.title);
        $('#disp-artist').text(song.artist || "Andre Youth");
        
        const coverUrl = MusicEngine.fixUrl(song.cover || song.profile, 'image');
        $('#artwork').attr('src', coverUrl);
        $('#app-background').css('background-image', `url(${coverUrl})`);
        
        const lrc = song.lyricsData || song.lyrics || "";
        currentLyrics = MusicEngine.parseLyrics(lrc);
        lastActiveLyricIdx = -1;
        renderLyrics();

        const audioUrl = MusicEngine.fixUrl(song.url || song.audioUrl, 'audio');
        if (audio) {
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
                    console.warn("Playback failed:", e);
                    $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
                    if (e.name !== 'NotAllowedError') {
                        alert('오디오를 재생할 수 없습니다. 주소를 확인해주세요.');
                    }
                }
            }
            $('#song-loading-overlay').removeClass('active');
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
            $('.lyric-line').removeClass('active near');
            const $active = $(`#lrc-${activeIdx}`).addClass('active');
            $(`#lrc-${activeIdx-1}`).addClass('near');
            $(`#lrc-${activeIdx+1}`).addClass('near');

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
            const cover = MusicEngine.fixUrl(song.cover || song.profile, 'image');
            const playingAni = isCurrent ? `<div class="playing-bars"><span></span><span></span><span></span></div>` : '';
            $container.append(`
                <div class="song-item ${isCurrent ? 'active' : ''}" data-index="${i}">
                    <img src="${cover}" alt="cover">
                    <div class="song-item-info">
                        <h4>${song.title}</h4>
                        <p>${song.artist || "Andre Youth"}</p>
                    </div>
                    ${playingAni}
                </div>
            `);
        });
    }

    function updateActiveInList() {
        $('.song-item').removeClass('active').find('.playing-bars').remove();
        const $current = $(`.song-item[data-index="${curIdx}"]`).addClass('active');
        $current.append(`<div class="playing-bars"><span></span><span></span><span></span></div>`);
    }

    function next() {
        let nextIdx;
        if (isShuffle) {
            nextIdx = Math.floor(Math.random() * playlistData.length);
        } else {
            nextIdx = (curIdx + 1) % playlistData.length;
        }
        loadSong(nextIdx, true);
    }

    function prev() {
        let prevIdx = (curIdx - 1 + playlistData.length) % playlistData.length;
        loadSong(prevIdx, true);
    }

    function syncFavoriteState() {
        const song = playlistData[curIdx];
        if (!song) return;
        const isFav = favorites.some(f => f.url === (song.url || song.audioUrl));
        $('#btn-scrap i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
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

    window.closeAllModals = () => {
        $('#modal-container').removeClass('active');
        $('.floating-popup').removeClass('active');
        chatRef.off('child_added');
    };

    // 4. Events
    function bindEvents() {
        $('#btn-play-pause').on('click', () => {
            if (audio.paused) { 
                audio.play().then(() => {
                    $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                }).catch(e => console.warn("Play failed:", e));
            }
            else { 
                audio.pause(); 
                $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); 
            }
        });
        $('#btn-next').on('click', next);
        $('#btn-prev').on('click', prev);

        $('#progress-bar-area').on('mousedown touchstart', (e) => { isScrubbing = true; handleSeek(e); });
        $(document).on('mousemove touchmove', (e) => { if (isScrubbing) handleSeek(e); });
        $(document).on('mouseup touchend', () => { isScrubbing = false; });
        
        if (audio) {
            audio.ontimeupdate = () => { if (!isScrubbing) updateProgressUI(); updateLyricsSync(audio.currentTime); };
            audio.onended = () => {
                if (repeatMode === 2) loadSong(curIdx, true);
                else next();
            };
        }

        function handleSeek(e) {
            if (!audio || isNaN(audio.duration)) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const rect = $('#progress-bar-area')[0].getBoundingClientRect();
            let pos = (clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));
            audio.currentTime = pos * audio.duration;
            updateProgressUI();
        }

        function updateProgressUI() {
            if (!audio || isNaN(audio.duration)) return;
            const per = (audio.currentTime / audio.duration) * 100;
            $('#progress-fill').css('width', per + '%');
            $('#progress-knob').css('left', per + '%');
            $('#time-now').text(formatTime(audio.currentTime));
            $('#time-total').text(formatTime(audio.duration));
        }

        function formatTime(sec) {
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        $('#btn-shuffle').on('click', function() {
            isShuffle = !isShuffle;
            $(this).toggleClass('active', isShuffle).css('color', isShuffle ? 'var(--primary)' : 'white');
        });

        $('#btn-repeat').on('click', function() {
            repeatMode = (repeatMode + 1) % 3;
            const $btn = $(this);
            if (repeatMode === 0) $btn.html('<i class="fa-solid fa-repeat"></i>').css('color', 'white');
            else if (repeatMode === 1) $btn.html('<i class="fa-solid fa-repeat"></i>').css('color', 'var(--primary)');
            else $btn.html('<i class="fa-solid fa-repeat-1"></i>').css('color', 'var(--primary)');
        });

        $('#btn-scrap').on('click', function() {
            const song = playlistData[curIdx]; if (!song) return;
            const songUrl = song.url || song.audioUrl;
            const idx = favorites.findIndex(f => f.url === songUrl);
            if (idx > -1) favorites.splice(idx, 1);
            else favorites.push(song);
            localStorage.setItem('andre_favs', JSON.stringify(favorites));
            syncFavoriteState();
        });

        $('#btn-open-list').on('click', () => $('#playlist-sheet').addClass('active'));
        $('#sheet-handle').on('click', () => $('#playlist-sheet').removeClass('active'));

        $('#album-trigger').on('click', () => $('#lyrics-overlay').toggleClass('active'));

        $('#btn-vol-pop').on('click', (e) => { e.stopPropagation(); $('.full-width-vol-container').toggleClass('active'); });
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.full-width-vol-container, #btn-vol-pop').length) $('.full-width-vol-container').removeClass('active');
        });
        
        $('#volume-slider').on('input', function() {
            const v = $(this).val();
            if (audio) audio.volume = v / 100;
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
                const $msgArea = $('#chat-messages');
                $msgArea.append(html);
                $msgArea.scrollTop($msgArea[0].scrollHeight);
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
            
            if (typeof firebase.auth !== 'function') return alert('인증 시스템을 불러오고 있습니다.');
            
            firebase.auth().signInWithEmailAndPassword(email, pw)
                .then((userCredential) => {
                    localStorage.setItem('adminUser', JSON.stringify({ uid: userCredential.user.uid, email: userCredential.user.email, isApproved: true, loginTime: Date.now() }));
                    alert('관리자 인증 성공!'); window.location.href = 'admin.html';
                })
                .catch(err => alert('인증 실패: ' + err.message));
        });

        $('#btn-do-signup').on('click', () => {
            const email = $('#signup-email').val().trim(), pw = $('#signup-password').val().trim();
            if (!email || !pw) return alert('정보를 입력해주세요.');
            
            if (typeof firebase.auth !== 'function') return alert('인증 시스템을 불러오고 있습니다.');
            
            firebase.auth().createUserWithEmailAndPassword(email, pw)
                .then(() => { alert('회원가입 요청 완료! 관리자 승인 후 로그인 가능합니다.'); toggleAuthMode(false); })
                .catch(err => alert('가입 실패: ' + err.message));
        });

        // 5. Keyboard Shortcuts
        $(document).on('keydown', (e) => {
            if ($(e.target).is('input, textarea')) return;
            switch(e.code) {
                case 'Space': e.preventDefault(); $('#btn-play-pause').click(); break;
                case 'ArrowRight': audio.currentTime += 10; break;
                case 'ArrowLeft': audio.currentTime -= 10; break;
                case 'ArrowUp': audio.volume = Math.min(1, audio.volume + 0.1); break;
                case 'ArrowDown': audio.volume = Math.max(0, audio.volume - 0.1); break;
                case 'KeyM': audio.muted = !audio.muted; break;
                case 'KeyS': $('#btn-shuffle').click(); break;
                case 'KeyR': $('#btn-repeat').click(); break;
            }
        });

        $(document).on('click', '.song-item', function() { 
            loadSong($(this).data('index'), true); 
            $('#playlist-sheet').removeClass('active'); 
        });
    }

    init();
});
