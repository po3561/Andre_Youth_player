$(document).ready(function () {
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
    
    // Server Connection Check
    db.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === true) {
            console.log("Firebase Connected");
            $('.header-title h2').text('믿음으로 기대하다 (Connected)');
        } else {
            console.warn("Firebase Disconnected");
            $('.header-title h2').text('서버 연결 중...');
        }
    });

    const playlistRef = db.ref('users/playlist');
    const chatRef = db.ref('chats');
    const inqRef = db.ref('users/inquiries');
    const audio = document.getElementById('audio-engine');

    let playlistData = [];
    let curIdx = 0;
    let isShuffle = false;
    let repeatMode = 0;
    let currentLyrics = [];
    let lastActiveLyricIdx = -1;
    let isScrubbing = false;
    let favorites = JSON.parse(localStorage.getItem('andre_favs')) || [];
    const userId = localStorage.getItem('player_uid') || ('user_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('player_uid', userId);

    function init() {
        bindEvents();
        fetchData();
        const vol = localStorage.getItem('player_vol') || 80;
        $('#volume-slider').val(vol);
        if (audio) audio.volume = vol / 100;
        
        setTimeout(() => {
            $('#splash-screen').fadeOut(500);
        }, 1500);
    }

    function fetchData() {
        playlistRef.on('value', snap => {
            const data = snap.val();
            if (data) {
                playlistData = Array.isArray(data) ? data : Object.values(data);
                renderPlaylist();
                if (playlistData.length > 0) loadSong(curIdx, false);
            } else {
                console.warn("No playlist data found in Firebase.");
            }
        }, err => alert("데이터 로드 실패: " + err.message));
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
            audio.pause();
            audio.src = audioUrl;
            audio.load();
            updateActiveInList();
            syncFavoriteState();

            if (shouldPlay) {
                // Show loading state
                $('#song-loading-overlay').fadeIn(200);
                
                audio.play().then(() => {
                    $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    $('#song-loading-overlay').fadeOut(300);
                }).catch(e => {
                    console.error("Play error:", e);
                    $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
                    $('#song-loading-overlay').fadeOut(300);
                    // Try fallback without proxy if proxy failed
                    if (audioUrl.includes('allorigins')) {
                        console.log("Retrying without proxy...");
                        const directUrl = song.url || song.audioUrl;
                        if (directUrl && (directUrl.includes('drive.google.com') || directUrl.includes('docs.google.com'))) {
                             const idMatch = directUrl.match(/id=([a-zA-Z0-9_-]+)/) || directUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                             if (idMatch) {
                                 audio.src = `https://docs.google.com/uc?export=download&id=${idMatch[1]}`;
                                 audio.play().then(() => {
                                     $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                                 }).catch(err => {
                                     alert("음원을 재생할 수 없습니다. 링크를 확인해주세요.");
                                 });
                             }
                        }
                    }
                });
            }
        }
    }

    function renderLyrics() {
        const $scroll = $('#lyrics-scroll').empty();
        if (!currentLyrics.length) {
            $scroll.append('<div class="lyric-line no-data">가사가 등록되지 않았습니다.</div>');
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
            $(`#lrc-${activeIdx-1}`).addClass('near');
            $(`#lrc-${activeIdx+1}`).addClass('near');
            lastActiveLyricIdx = activeIdx;
            
            const container = $('#lyrics-scroll')[0];
            if (container && $active.length) {
                container.scrollTo({ top: $active[0].offsetTop - 120, behavior: 'smooth' });
            }
        }
    }

    function renderPlaylist() {
        const $container = $('#song-list-container').empty();
        playlistData.forEach((song, i) => {
            const isCurrent = i === curIdx;
            const cover = MusicEngine.fixUrl(song.cover || song.profile, 'image');
            $container.append(`
                <div class="song-item ${isCurrent ? 'active' : ''}" data-index="${i}">
                    <img src="${cover}" alt="cover">
                    <div class="song-item-info">
                        <h4>${song.title}</h4>
                        <p>${song.artist || "Andre Youth"}</p>
                    </div>
                </div>
            `);
        });
    }

    function updateActiveInList() {
        $('.song-item').removeClass('active');
        $(`.song-item[data-index="${curIdx}"]`).addClass('active');
    }

    function bindEvents() {
        $('#btn-play-pause').on('click', () => {
            if (!audio.src) return;
            if (audio.paused) audio.play().then(() => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>'));
            else { audio.pause(); $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>'); }
        });

        $('#btn-next').on('click', () => {
            let n = isShuffle ? Math.floor(Math.random() * playlistData.length) : (curIdx + 1) % playlistData.length;
            loadSong(n, true);
        });

        $('#btn-prev').on('click', () => {
            let p = (curIdx - 1 + playlistData.length) % playlistData.length;
            loadSong(p, true);
        });

        if (audio) {
            audio.ontimeupdate = () => {
                if (!isScrubbing && !isNaN(audio.duration)) {
                    const per = (audio.currentTime / audio.duration) * 100;
                    $('#progress-fill').css('width', per + '%');
                    $('#progress-knob').css('left', per + '%');
                    $('#time-now').text(formatTime(audio.currentTime));
                    $('#time-total').text(formatTime(audio.duration));
                }
                updateLyricsSync(audio.currentTime);
            };
            audio.onended = () => (repeatMode === 2) ? loadSong(curIdx, true) : $('#btn-next').click();
        }

        function formatTime(s) {
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec < 10 ? '0' : ''}${sec}`;
        }

        $('#progress-bar-area').on('mousedown touchstart', (e) => {
            isScrubbing = true; handleSeek(e);
        });
        $(document).on('mousemove touchmove', (e) => { if (isScrubbing) handleSeek(e); });
        $(document).on('mouseup touchend', () => { isScrubbing = false; });

        function handleSeek(e) {
            if (!audio.duration) return;
            const x = e.clientX || (e.touches && e.touches[0].clientX);
            const rect = $('#progress-bar-area')[0].getBoundingClientRect();
            let pos = (x - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));
            audio.currentTime = pos * audio.duration;
        }

        $('#btn-shuffle').on('click', function() {
            isShuffle = !isShuffle;
            $(this).toggleClass('active', isShuffle);
        });

        $('#btn-repeat').on('click', function() {
            repeatMode = (repeatMode + 1) % 3;
            const icons = ['fa-repeat', 'fa-repeat', 'fa-repeat-1'];
            $(this).find('i').attr('class', 'fa-solid ' + icons[repeatMode]);
            $(this).toggleClass('active', repeatMode > 0);
        });

        $('#btn-open-list').on('click', () => $('#playlist-sheet').addClass('active'));
        $('#sheet-handle').on('click', () => $('#playlist-sheet').removeClass('active'));
        $('#album-trigger').on('click', () => $('#lyrics-overlay').toggleClass('active'));

        $('#btn-vol-pop').on('click', (e) => { e.stopPropagation(); $('.full-width-vol-container').toggleClass('active'); });
        $('#volume-slider').on('input', function() { audio.volume = $(this).val() / 100; localStorage.setItem('player_vol', $(this).val()); });

        $('#btn-open-chat').on('click', () => {
            closeAllModals();
            $('#modal-overlay, #chat-popup').addClass('active');
            $('#chat-messages').empty();
            chatRef.limitToLast(50).on('child_added', snap => {
                const m = snap.val(); if (!m) return;
                $('#chat-messages').append(`<div class="msg-bubble ${m.sender === userId ? 'mine' : ''}">${m.text}</div>`)
                    .scrollTop($('#chat-messages')[0].scrollHeight);
            });
        });

        $('#btn-inquiry').on('click', () => {
            closeAllModals();
            $('#modal-overlay, #inquiry-popup').addClass('active');
        });

        $('#btn-admin-login').on('click', () => {
            closeAllModals();
            $('#modal-overlay, #admin-login-popup').addClass('active');
        });

        $('#btn-send-chat').on('click', () => {
            const t = $('#chat-input').val().trim(); if (!t) return;
            chatRef.push({ text: t, sender: userId, timestamp: Date.now() }); $('#chat-input').val('');
        });

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

        $('#btn-do-login').on('click', () => {
            let e = $('#admin-email').val().trim(), p = $('#admin-password').val().trim();
            if (!e || !p) return alert('정보를 입력하세요.');
            if (!e.includes('@')) e += '@admin.com';
            firebase.auth().signInWithEmailAndPassword(e, p)
                .then((res) => {
                    // Store minimal user info for admin-script.js check
                    localStorage.setItem('adminUser', JSON.stringify({ email: res.user.email, isApproved: true }));
                    window.location.href = 'admin.html';
                })
                .catch(err => alert('로그인 실패: ' + err.message));
        });

        $('#btn-do-signup').on('click', () => {
            const e = $('#signup-email').val().trim(), p = $('#signup-password').val().trim();
            if (!e || !p) return alert('정보를 입력하세요.');
            firebase.auth().createUserWithEmailAndPassword(e, p)
                .then(() => {
                    alert('가입 성공! 이제 로그인하세요.');
                    toggleAuthMode(false);
                })
                .catch(err => alert('가입 실패: ' + err.message));
        });

        $(document).on('click', '.song-item', function() {
            loadSong($(this).data('index'), true); $('#playlist-sheet').removeClass('active');
        });

        window.closeAllModals = () => { 
            $('.modal-overlay, .floating-popup').removeClass('active'); 
            chatRef.off(); 
        };

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

        window.syncFavoriteState = () => {
            const song = playlistData[curIdx];
            if (!song) return;
            const isFav = favorites.includes(song.id || song.title);
            $('#btn-scrap i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        };

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

    init();
});
