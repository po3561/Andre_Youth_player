$(document).ready(function () {
    /* ─── 앱 설정 (잠시 비활성화) ───
    if (window.CloudflareAPI) { ... }
    */
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

    /* ─── Cloudflare Worker 데이터 폴링 ─── */
    async function fetchData() {
        if (!window.CloudflareAPI) {
            console.error("CloudflareAPI not loaded");
            return;
        }
        
        try {
            const data = await window.CloudflareAPI.D1.getPlaylist();
            
            if (data && data.length > 0) {
                console.log(`✅ Cloudflare 플레이리스트 로드 성공: ${data.length}곡`);
                applyPlaylist(data);
                $('#top-subtitle').text('ANDREW YOUTH').css('color', '');
            } else {
                console.warn("Cloudflare 플레이리스트가 비어있습니다.");
                $('#song-list-container').html('<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.4);">등록된 곡이 없습니다.<br>관리자 페이지에서 곡을 추가해주세요.</div>');
            }
        } catch (error) {
            console.error("Cloudflare 연결 실패:", error);
            $('#top-subtitle').text('서버 재연결 중...').css('color', '#ffb74d');
        }
    }
    
    // 5분 단위로 폴링하여 데이터 갱신 (실시간 대체)
    setInterval(fetchData, 300000);

    /* ─── 공통 플레이리스트 적용 ─── */
    function applyPlaylist(data) {
        const prevSongId = playlistData[curIdx] ? playlistData[curIdx].id : null;
        const wasPlaying = audio && !audio.paused;

        playlistData = (Array.isArray(data) ? data : Object.values(data)).map(song => ({
            ...song,
            url: song.url || song.audioUrl || '',
            cover: song.cover || song.coverUrl || song.profile || '',
            lyrics: song.lyrics || song.lyricsData || '',
            lyricsData: song.lyricsData || song.lyrics || '',
            artist: song.artist || 'Andre Youth'
        }));

        renderPlaylist();

        // 현재 재생 중이던 곡이 여전히 목록에 있으면 인덱스 유지
        if (prevSongId) {
            const foundIdx = playlistData.findIndex(s => s.id === prevSongId);
            if (foundIdx !== -1) {
                curIdx = foundIdx;
                updateActiveInList();
                return;
            }
        }

        if (playlistData.length > 0 && (!audio.src || !wasPlaying)) {
            loadSong(curIdx, false);
        }
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
        
        let fallbacks;
        if (isLocalUrl(originalUrl)) {
            // Local file - use directly, no fallbacks needed
            fallbacks = [originalUrl];
        } else {
            // For audio, we need fallbacks since Google Drive is unreliable
            const idMatch = originalUrl.match(/id=([a-zA-Z0-9_-]+)/) || 
                           originalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            
            if (isFirebaseStorageUrl(originalUrl)) {
                fallbacks = [originalUrl];
            } else if (idMatch) {
                fallbacks = MusicEngine.getFallbacks(idMatch[1]);
            } else {
                fallbacks = [audioUrl];
            }
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
    function isLocalUrl(url) {
        return url && !url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('data:');
    }

    function isFirebaseStorageUrl(url) {
        return url && (url.includes('firebasestorage.googleapis.com') || 
                      url.includes('firebasestorage.app') ||
                      url.startsWith('blob:') || url.startsWith('data:'));
    }

    function resolveUrl(url, type) {
        if (!url) return type === 'image' ? MusicEngine.placeholderImage : '';
        if (isLocalUrl(url)) return url;
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
            $scroll.append(`<div class="lyric-line clickable" id="lrc-${i}" data-time="${l.time}">${l.text}</div>`);
        });
        $scroll.scrollTop(0);
    }

    function updateLyricsSync(time) {
        if (!currentLyrics.length) return;
        const currentSong = playlistData[curIdx];
        const syncOffset = (currentSong && currentSong.syncOffset) ? parseFloat(currentSong.syncOffset) : 0;
        const adjustedTime = time + syncOffset;

        let activeIdx = -1;
        for (let i = 0; i < currentLyrics.length; i++) {
            if (adjustedTime >= currentLyrics[i].time) activeIdx = i;
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
                    <img src="${cover}" loading="lazy" alt="cover" onerror="this.src='${MusicEngine.placeholderImage}'">
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

        /* Album art tap → lyrics open */
        $('.album-art-wrap').on('click', function() {
            $('#lyrics-overlay').addClass('active');
        });

        /* Lyrics close button */
        $('#btn-close-lyrics').on('click', function(e) {
            e.stopPropagation();
            $('#lyrics-overlay').removeClass('active');
        });

        /* 가사 클릭 시 점프 */
        $(document).on('click', '.lyric-line.clickable', function(e) {
            const time = $(this).data('time');
            if (time !== undefined && !isNaN(time) && audio.duration) {
                const targetTime = time + 0.05; // 약간 뒤로 점프하여 확실히 활성화
                audio.currentTime = targetTime;
                updateLyricsSync(targetTime); // 즉각적인 UI 피드백
                
                if (audio.paused) {
                    audio.play().then(() => {
                        $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    }).catch(console.error);
                }
            }
        });

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
            $('#chat-messages').append('<div class="msg-bubble">Cloudflare 모드에서는 채팅을 지원하지 않습니다.</div>');
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
            alert('Cloudflare 모드에서는 채팅을 지원하지 않습니다.');
        }

        /* Submit Inquiry */
        $('#btn-submit-inquiry').on('click', () => {
            alert('Cloudflare 모드에서는 문의 기능을 지원하지 않습니다.');
        });

        $('#btn-do-login').on('click', () => {
            const id = $('#admin-id').val().trim();
            const pw = $('#admin-password').val().trim();
            
            if (!id || !pw) return alert('아이디와 비밀번호를 입력하세요.');
            
            // Cloudflare Migration: 단순 관리자 로그인 우회 (아이디: admin / 비밀번호: 1234)
            if (id === 'admin' && pw === '1234') {
                localStorage.setItem('adminUser', JSON.stringify({ 
                    id: 'admin', name: 'Master Admin', uid: 'admin_uid_1', isApproved: true, isAdmin: true 
                }));
                closeAllModals();
                window.location.href = 'admin.html';
            } else {
                alert('비밀번호가 틀렸습니다. 기본 계정: admin / 1234');
            }
        });

        $('#btn-do-signup').on('click', () => {
            alert('Cloudflare 모드에서는 회원가입 대신 공용 관리자 계정(admin/1234)을 사용해주세요.');
        });

        /* Song item click */
        $(document).on('click', '.song-item', function() {
            loadSong($(this).data('index'), true); 
            $('#playlist-sheet').removeClass('active');
        });

        /* Close Modals */
        function closeAllModals() { 
            $('.modal-overlay, .floating-popup').removeClass('active'); 
            if (typeof chatRef !== 'undefined' && chatRef) chatRef.off('child_added');
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
