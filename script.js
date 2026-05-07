$(document).ready(function () {
    /* ─── Firebase Init ─── */
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
    
    db.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === true) {
            console.log("Firebase Connected");
            $('#top-subtitle').text('믿음으로 기대하다 (CONNECTED)');
        } else {
            console.warn("Firebase Disconnected");
            $('#top-subtitle').text('서버 연결 중...');
        }
    });

    const playlistRef = db.ref('users/playlist');
    const chatRef = db.ref('chats');
    const inqRef = db.ref('users/inquiries');
    const audio = document.getElementById('audio-engine');

    /* ─── State ─── */
    let playlistData = [];
    let curIdx = 0;
    let isShuffle = false;
    let repeatMode = 0; // 0=off, 1=all, 2=one
    let currentLyrics = [];
    let lastActiveLyricIdx = -1;
    let isScrubbing = false;
    let pendingSeekPos = 0;
    let favorites = JSON.parse(localStorage.getItem('andre_favs') || '[]');
    const userId = localStorage.getItem('player_uid') || ('user_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('player_uid', userId);

    /* ─── Init ─── */
    function init() {
        setTimeout(() => { $('#splash-screen').fadeOut(600); }, 1200);
        try {
            bindEvents();
            fetchData();
            const vol = localStorage.getItem('player_vol') || 80;
            $('#volume-slider').val(vol);
            if (audio) audio.volume = vol / 100;
        } catch (e) {
            console.error("Initialization error:", e);
        }
    }

    /* ─── Firebase Data Fetch ─── */
    function fetchData() {
        playlistRef.on('value', snap => {
            const data = snap.val();
            if (data) {
                playlistData = Array.isArray(data) ? data : Object.values(data);
                playlistData = playlistData.map(song => ({
                    ...song,
                    url: song.url || song.audioUrl || '',
                    cover: song.cover || song.coverUrl || song.profile || '',
                    lyrics: song.lyrics || song.lyricsData || '',
                    lyricsData: song.lyricsData || song.lyrics || '',
                    artist: song.artist || 'Andre Youth'
                }));
                renderPlaylist();
                if (playlistData.length > 0 && !audio.src) {
                    loadSong(curIdx, false);
                }
            } else {
                console.warn("No playlist data found in Firebase.");
                $('#song-list-container').html('<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.4);">등록된 곡이 없습니다.</div>');
            }
        }, err => {
            console.error("데이터 로드 실패:", err);
        });
    }

    /* ─── Load Song ─── */
    async function loadSong(index, shouldPlay = false) {
        if (!playlistData[index]) return;
        curIdx = index;
        const song = playlistData[index];

        $('#disp-title').text(song.title || 'Unknown');
        $('#disp-artist').text(song.artist || 'Andre Youth');
        
        // Cover image - use Firebase Storage URL directly or convert Drive URL
        const coverUrl = resolveUrl(song.cover, 'image');
        $('#artwork').attr('src', coverUrl);
        $('#app-background').css('background-image', `url(${coverUrl})`);
        
        // Lyrics
        const lrc = song.lyricsData || song.lyrics || '';
        currentLyrics = MusicEngine.parseLyrics(lrc);
        lastActiveLyricIdx = -1;
        renderLyrics();

        // Audio URL
        const originalUrl = song.url || song.audioUrl || '';
        if (!originalUrl) {
            console.warn('No audio URL for song:', song.title);
            return;
        }

        const audioUrl = resolveUrl(originalUrl, 'audio');
        
        // For audio, we need fallbacks since Google Drive is unreliable
        const idMatch = originalUrl.match(/id=([a-zA-Z0-9_-]+)/) || 
                       originalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        
        let fallbacks;
        if (isFirebaseStorageUrl(originalUrl)) {
            fallbacks = [originalUrl];
        } else if (idMatch) {
            fallbacks = MusicEngine.getFallbacks(idMatch[1]);
        } else {
            fallbacks = [audioUrl];
        }

        let tryIdx = 0;

        const tryPlay = async (url) => {
            try {
                audio.pause();
                audio.src = url;
                audio.load();
                
                if (shouldPlay) {
                    $('#song-loading-overlay').css('display', 'flex');
                    await new Promise(r => setTimeout(r, 200));
                    await audio.play();
                    $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    $('#song-loading-overlay').fadeOut(300);
                }
            } catch (e) {
                console.error(`Play failed for ${url}:`, e.name, e.message);
                
                if (e.name !== 'AbortError') { 
                    tryIdx++;
                    if (tryIdx < fallbacks.length) {
                        console.log(`Retrying with fallback ${tryIdx}...`);
                        setTimeout(() => tryPlay(fallbacks[tryIdx]), 300);
                        return;
                    }
                    $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
                    $('#song-loading-overlay').fadeOut(300);
                }
            }
        };

        updateActiveInList();
        syncFavoriteState();
        tryPlay(fallbacks[0]);
    }

    /* ─── URL Resolution Helper ─── */
    function isFirebaseStorageUrl(url) {
        return url && (url.includes('firebasestorage.googleapis.com') || 
                      url.includes('firebasestorage.app') ||
                      url.startsWith('blob:') || url.startsWith('data:'));
    }

    function resolveUrl(url, type) {
        if (!url) return type === 'image' ? MusicEngine.placeholderImage : '';
        if (isFirebaseStorageUrl(url)) return url;
        return MusicEngine.fixUrl(url, type);
    }

    /* ─── Lyrics ─── */
    function renderLyrics() {
        const $scroll = $('#lyrics-scroll').empty();
        if (!currentLyrics.length) {
            $scroll.append('<div class="lyric-line" style="opacity:0.4;filter:none;">가사가 등록되지 않았습니다.</div>');
            return;
        }
        currentLyrics.forEach((l, i) => {
            $scroll.append(`<div class="lyric-line" id="lrc-${i}">${l.text}</div>`);
        });
        $scroll.scrollTop(0);
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
            if (activeIdx > 0) $(`#lrc-${activeIdx-1}`).addClass('near');
            if (activeIdx < currentLyrics.length - 1) $(`#lrc-${activeIdx+1}`).addClass('near');
            lastActiveLyricIdx = activeIdx;
            
            const container = $('#lyrics-scroll')[0];
            if (container && $active.length) {
                container.scrollTo({ top: $active[0].offsetTop - container.clientHeight / 2 + 20, behavior: 'smooth' });
            }
        }
    }

    /* ─── Playlist Rendering ─── */
    function renderPlaylist() {
        const $container = $('#song-list-container').empty();
        playlistData.forEach((song, i) => {
            const isCurrent = i === curIdx;
            const cover = resolveUrl(song.cover, 'image');
            $container.append(`
                <div class="song-item ${isCurrent ? 'active' : ''}" data-index="${i}">
                    <img src="${cover}" alt="cover" onerror="this.src='${MusicEngine.placeholderImage}'">
                    <div class="song-item-info">
                        <h4>${song.title || 'Unknown'}</h4>
                        <p>${song.artist || 'Andre Youth'}</p>
                    </div>
                </div>
            `);
        });
    }

    function updateActiveInList() {
        $('.song-item').removeClass('active');
        $(`.song-item[data-index="${curIdx}"]`).addClass('active');
    }

    /* ─── Format Time ─── */
    function formatTime(s) {
        if (!s || isNaN(s) || !isFinite(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    }

    /* ─── Bind All Events ─── */
    function bindEvents() {
        /* Play/Pause */
        $('#btn-play-pause').on('click', () => {
            if (!audio.src || !playlistData.length) return;
            if (audio.paused) {
                audio.play().then(() => {
                    $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                }).catch(e => console.error('Play error:', e));
            } else { 
                audio.pause(); 
                $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); 
            }
        });

        /* Next */
        $('#btn-next').on('click', () => {
            if (!playlistData.length) return;
            let n;
            if (isShuffle) {
                n = Math.floor(Math.random() * playlistData.length);
                if (playlistData.length > 1 && n === curIdx) n = (n + 1) % playlistData.length;
            } else {
                n = (curIdx + 1) % playlistData.length;
            }
            loadSong(n, true);
        });

        /* Prev */
        $('#btn-prev').on('click', () => {
            if (!playlistData.length) return;
            if (audio.currentTime > 3) { audio.currentTime = 0; return; }
            loadSong((curIdx - 1 + playlistData.length) % playlistData.length, true);
        });

        /* Audio Time Update */
        if (audio) {
            audio.addEventListener('timeupdate', () => {
                if (!isScrubbing && !isNaN(audio.duration) && audio.duration > 0) {
                    const per = (audio.currentTime / audio.duration) * 100;
                    $('#progress-fill').css('width', per + '%');
                    $('#progress-knob').css('left', per + '%');
                    $('#time-now').text(formatTime(audio.currentTime));
                    $('#time-total').text(formatTime(audio.duration));
                }
                updateLyricsSync(audio.currentTime);
            });

            /* Song Ended */
            audio.addEventListener('ended', () => {
                if (repeatMode === 2) {
                    audio.currentTime = 0;
                    audio.play().then(() => {
                        $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    }).catch(() => {});
                } else if (repeatMode === 1) {
                    let n = isShuffle ? Math.floor(Math.random() * playlistData.length) : (curIdx + 1) % playlistData.length;
                    loadSong(n, true);
                } else {
                    if (curIdx < playlistData.length - 1) {
                        loadSong(curIdx + 1, true);
                    } else {
                        $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
                    }
                }
            });
        }

        /* ─── Progress Bar Seek (FIXED: cancelable check) ─── */
        const $progressBar = $('#progress-bar-area');
        
        function getSeekPos(e) {
            const touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
            const x = touch ? touch.clientX : e.clientX;
            const rect = $progressBar[0].getBoundingClientRect();
            return Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        }

        function updateSeekUI(pos) {
            const per = pos * 100;
            $('#progress-fill').css('width', per + '%');
            $('#progress-knob').css('left', per + '%');
            if (audio.duration && !isNaN(audio.duration)) {
                $('#time-now').text(formatTime(pos * audio.duration));
            }
        }

        // Use native addEventListener to properly handle {passive: false}
        $progressBar[0].addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!audio.duration || isNaN(audio.duration)) return;
            isScrubbing = true;
            $progressBar.addClass('scrubbing');
            pendingSeekPos = getSeekPos(e);
            updateSeekUI(pendingSeekPos);
        });

        $progressBar[0].addEventListener('touchstart', function(e) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            if (!audio.duration || isNaN(audio.duration)) return;
            isScrubbing = true;
            $progressBar.addClass('scrubbing');
            pendingSeekPos = getSeekPos(e);
            updateSeekUI(pendingSeekPos);
        }, { passive: false });

        document.addEventListener('mousemove', function(e) {
            if (!isScrubbing) return;
            e.preventDefault();
            pendingSeekPos = getSeekPos(e);
            updateSeekUI(pendingSeekPos);
        });

        document.addEventListener('touchmove', function(e) {
            if (!isScrubbing) return;
            if (e.cancelable) e.preventDefault();
            pendingSeekPos = getSeekPos(e);
            updateSeekUI(pendingSeekPos);
        }, { passive: false });

        document.addEventListener('mouseup', function() {
            if (!isScrubbing) return;
            isScrubbing = false;
            $progressBar.removeClass('scrubbing');
            if (audio.duration && !isNaN(audio.duration)) {
                audio.currentTime = pendingSeekPos * audio.duration;
            }
        });

        document.addEventListener('touchend', function() {
            if (!isScrubbing) return;
            isScrubbing = false;
            $progressBar.removeClass('scrubbing');
            if (audio.duration && !isNaN(audio.duration)) {
                audio.currentTime = pendingSeekPos * audio.duration;
            }
        });

        /* ─── Shuffle ─── */
        $('#btn-shuffle').on('click', function() {
            isShuffle = !isShuffle;
            $(this).toggleClass('active', isShuffle);
        });

        /* ─── Repeat (3 modes) ─── */
        $('#btn-repeat').on('click', function() {
            repeatMode = (repeatMode + 1) % 3;
            if (repeatMode === 0) {
                $(this).removeClass('active').html('<i class="fa-solid fa-repeat"></i>');
            } else if (repeatMode === 1) {
                $(this).addClass('active').html('<i class="fa-solid fa-repeat"></i>');
            } else {
                $(this).addClass('active').html('<i class="fa-solid fa-repeat"></i><span class="repeat-one-badge">1</span>');
            }
        });

        /* ─── Playlist Sheet (swipe gesture) ─── */
        const $sheet = $('#playlist-sheet');
        let sheetStartY = 0;
        let sheetDragging = false;

        $('#btn-open-list').on('click', () => $sheet.addClass('active'));
        $('#sheet-handle').on('click', () => $sheet.removeClass('active'));

        $sheet[0].addEventListener('touchstart', function(e) {
            sheetStartY = e.touches[0].clientY;
            sheetDragging = false;
        }, { passive: true });

        $sheet[0].addEventListener('touchmove', function(e) {
            const diff = e.touches[0].clientY - sheetStartY;
            const scrollTop = document.getElementById('song-list-container')?.scrollTop || 0;
            if (diff > 10 && scrollTop <= 0) {
                sheetDragging = true;
                if (e.cancelable) e.preventDefault();
                const drag = Math.min(diff, 300);
                $sheet.css('transform', `translate(-50%, ${drag}px)`);
            }
        }, { passive: false });

        $sheet[0].addEventListener('touchend', function() {
            if (!sheetDragging) return;
            $sheet.css('transform', '');
            const diff = event.changedTouches ? event.changedTouches[0].clientY - sheetStartY : 0;
            if (diff > 100) $sheet.removeClass('active');
            sheetDragging = false;
        });

        /* Album art tap → lyrics */
        $('#album-trigger').on('click', () => $('#lyrics-overlay').toggleClass('active'));

        /* ─── Volume (accordion below button) ─── */
        $('#btn-vol-pop').on('click', function(e) { 
            e.stopPropagation(); 
            $('.volume-accordion').toggleClass('active'); 
        });
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.volume-accordion, #btn-vol-pop').length) {
                $('.volume-accordion').removeClass('active');
            }
        });
        $('#volume-slider').on('input', function() { 
            audio.volume = $(this).val() / 100; 
            localStorage.setItem('player_vol', $(this).val()); 
        });

        /* ─── Chat ─── */
        $('#btn-open-chat').on('click', () => {
            closeAllModals();
            $('#modal-container, #chat-popup').addClass('active');
            $('#chat-messages').empty();
            chatRef.limitToLast(50).on('child_added', snap => {
                const m = snap.val(); if (!m) return;
                $('#chat-messages').append(`<div class="msg-bubble ${m.sender === userId ? 'mine' : ''}">${m.text}</div>`)
                    .scrollTop($('#chat-messages')[0].scrollHeight);
            });
        });

        /* Inquiry */
        $('#btn-inquiry').on('click', () => {
            closeAllModals();
            $('#modal-container, #inquiry-popup').addClass('active');
        });

        /* Admin Login */
        $('#btn-admin-login').on('click', () => {
            closeAllModals();
            $('#modal-container, #admin-popup').addClass('active');
        });

        /* Send Chat */
        $('#btn-send-chat').on('click', sendChat);
        $('#chat-input').on('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
        function sendChat() {
            const t = $('#chat-input').val().trim(); 
            if (!t) return;
            chatRef.push({ text: t, sender: userId, timestamp: Date.now() }); 
            $('#chat-input').val('');
        }

        /* Submit Inquiry */
        $('#btn-submit-inquiry').on('click', () => {
            const title = $('#inq-title').val().trim();
            const content = $('#inq-content').val().trim();
            const contact = $('#inq-contact').val().trim();
            if (!title || !content) return alert('제목과 내용을 입력해주세요.');
            
            inqRef.push({ title, content, contact, timestamp: Date.now(), userId })
                .then(() => {
                    alert('문의가 전송되었습니다.');
                    closeAllModals();
                    $('#inq-title, #inq-content, #inq-contact').val('');
                });
        });

        /* ─── Admin Auth (FIXED: proper error message) ─── */
        $('#btn-do-login').on('click', () => {
            let e = $('#admin-email').val().trim(), p = $('#admin-password').val().trim();
            if (!e || !p) return alert('이메일과 비밀번호를 입력하세요.');
            if (!e.includes('@')) e += '@admin.com';
            
            firebase.auth().signInWithEmailAndPassword(e, p)
                .then((res) => {
                    localStorage.setItem('adminUser', JSON.stringify({ 
                        email: res.user.email, uid: res.user.uid, isApproved: true 
                    }));
                    closeAllModals();
                    window.location.href = 'admin.html';
                })
                .catch(err => {
                    let msg = '로그인 실패';
                    switch(err.code) {
                        case 'auth/user-not-found': msg = '등록되지 않은 이메일입니다.'; break;
                        case 'auth/wrong-password': msg = '비밀번호가 틀렸습니다.'; break;
                        case 'auth/invalid-email': msg = '이메일 형식이 올바르지 않습니다.'; break;
                        case 'auth/invalid-credential': msg = '이메일 또는 비밀번호가 올바르지 않습니다.'; break;
                        case 'auth/too-many-requests': msg = '잠시 후 다시 시도해주세요.'; break;
                        case 'auth/user-disabled': msg = '비활성화된 계정입니다.'; break;
                        default: msg = '로그인 실패: ' + (err.message || '알 수 없는 오류');
                    }
                    alert(msg);
                });
        });

        $('#btn-do-signup').on('click', () => {
            const e = $('#signup-email').val().trim(), p = $('#signup-password').val().trim();
            if (!e || !p) return alert('이메일과 비밀번호를 입력하세요.');
            if (p.length < 6) return alert('비밀번호는 6자 이상이어야 합니다.');
            firebase.auth().createUserWithEmailAndPassword(e, p)
                .then(() => {
                    alert('가입 성공! 이제 로그인하세요.');
                    toggleAuthMode(false);
                })
                .catch(err => alert('가입 실패: ' + err.message));
        });

        /* Song item click */
        $(document).on('click', '.song-item', function() {
            loadSong($(this).data('index'), true); 
            $('#playlist-sheet').removeClass('active');
        });

        /* Close Modals */
        function closeAllModals() { 
            $('.modal-overlay, .floating-popup').removeClass('active'); 
            chatRef.off('child_added');
        }
        window.closeAllModals = closeAllModals; 

        /* Toggle Auth Mode */
        window.toggleAuthMode = (isSignup) => {
            if (isSignup) {
                $('#admin-auth-form').hide();
                $('#admin-signup-form').show();
                $('#admin-popup-title').text('관리자 회원가입');
            } else {
                $('#admin-auth-form').show();
                $('#admin-signup-form').hide();
                $('#admin-popup-title').text('관리자 인증');
            }
        };

        /* Favorites */
        window.syncFavoriteState = syncFavoriteState;
        $('#btn-scrap').on('click', () => {
            const song = playlistData[curIdx];
            if (!song) return;
            const id = song.id || song.title;
            if (favorites.includes(id)) favorites = favorites.filter(f => f !== id);
            else favorites.push(id);
            localStorage.setItem('andre_favs', JSON.stringify(favorites));
            syncFavoriteState();
        });
    }

    function syncFavoriteState() {
        const song = playlistData[curIdx];
        if (!song) return;
        const isFav = favorites.includes(song.id || song.title);
        $('#btn-scrap i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        $('#btn-scrap').toggleClass('active', isFav);
    }

    init();
});
