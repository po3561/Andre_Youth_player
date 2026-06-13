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
    let currentLoadId = 0; // 오디오 로딩 씹힘 방지용 ID
    let currentPlayingSong = null; // 캡슐화된 현재 곡 객체
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
            // Mobile Audio Unlock
            const unlockAudio = () => {
                if (audio.paused && !audio.src) {
                    audio.src = 'data:audio/mp3;base64,//OwgAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA////////////////AAAAAAAAAAAAAAAAAAAAAAADTEFNRTMuMTAwA8QAAAAALhsAAQAEAAASRgAAAnEAAAAAAA==';
                    audio.play().then(() => {
                        audio.pause();
                        audio.src = '';
                    }).catch(() => {});
                }
                document.removeEventListener('touchstart', unlockAudio);
                document.removeEventListener('click', unlockAudio);
            };
            document.addEventListener('touchstart', unlockAudio, { once: true });
            document.addEventListener('click', unlockAudio, { once: true });

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
                
                // 설정 데이터 가져오기
                const settings = await window.CloudflareAPI.D1.getSettings();
                const mainTitle = settings.mainTitle || 'ANDREW YOUTH';
                const subTitle = settings.subTitle || '믿음으로 기대하다';
                $('#top-subtitle').text(mainTitle).css('color', '');
                $('#top-title').text(subTitle);

                // 팝업 광고/공지 표시 로직 (최초 1회만)
                if (!window.isPopupChecked) {
                    window.isPopupChecked = true;
                    if (settings.popupEnabled && settings.popupImageUrl) {
                        const hideUntil = localStorage.getItem('andre_youth_popup_hide');
                        const now = Date.now();
                        if (!hideUntil || now > parseInt(hideUntil)) {
                            $('#startup-popup-img').attr('src', settings.popupImageUrl);
                            $('#startup-popup-overlay').css('display', 'flex');
                        }
                    }
                }
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

        playlistData = (Array.isArray(data) ? data : Object.values(data)).map(song => {
            const coverUrl = resolveUrl(song.coverUrl || song.cover || song.profile || '', 'image');
            const candidateAudio = (typeof song.audio === 'string' && song.audio.trim()) ? song.audio : '';
            let originalAudioUrl = candidateAudio || song.audioUrl || song.url || '';
            const audioUrl = resolveUrl(originalAudioUrl, 'audio');
            const lrc = song.lyricsData || song.lyrics || '';
            const parsedLyrics = MusicEngine.parseLyrics(lrc);
            
            let fallbacks = [];
            if (originalAudioUrl) {
                if (isLocalUrl(originalAudioUrl) || isFirebaseStorageUrl(originalAudioUrl)) {
                    fallbacks = [originalAudioUrl];
                } else {
                    const idMatch = originalAudioUrl.match(/id=([a-zA-Z0-9_-]+)/) || 
                                   originalAudioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (idMatch) {
                        fallbacks = MusicEngine.getFallbacks(idMatch[1]);
                    } else {
                        fallbacks = [audioUrl];
                    }
                }
            } else {
                // 오디오 URL이 데이터베이스에 아예 없는 곡일 경우 앱 크래시 방지
                const dummyAudio = 'data:audio/mp3;base64,//OwgAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA////////////////AAAAAAAAAAAAAAAAAAAAAAADTEFNRTMuMTAwA8QAAAAALhsAAQAEAAASRgAAAnEAAAAAAA==';
                fallbacks = [dummyAudio];
                originalAudioUrl = dummyAudio;
            }

            return {
                ...song, // 원본 필드 유지
                id: song.id,
                title: song.title || 'Unknown',
                artist: song.artist || 'Andre Youth',
                coverUrl: coverUrl,
                originalAudioUrl: originalAudioUrl,
                fallbacks: fallbacks,
                parsedLyrics: parsedLyrics,
                syncOffset: song.syncOffset ? parseFloat(song.syncOffset) : 0
            };
        });

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
            playSongObject(playlistData[curIdx], false);
        }
    }

    /* ─── State Injection (객체 통주입 방식 재생기) ─── */
    async function playSongObject(song, shouldPlay = false) {
        if (!song) return;
        currentPlayingSong = song; // 캡슐화된 상태 저장
        
        currentLoadId = Date.now();
        const myLoadId = currentLoadId;

        // 확실한 초기화
        if (audio) {
            audio.pause();
            $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
        }

        // 화면 렌더링 캡슐화 (넘겨받은 객체 정보만으로 그림)
        $('#disp-title').text(song.title);
        $('#disp-artist').text(song.artist);
        $('#artwork').attr('src', song.coverUrl);
        $('#app-background').css('background-image', `url(${song.coverUrl})`);
        
        lastActiveLyricIdx = -1;
        renderLyrics(song.parsedLyrics);

        if (!song.originalAudioUrl) {
            console.warn('No audio URL for song:', song.title);
            return;
        }

        let tryIdx = 0;
        const fallbacks = song.fallbacks;

        const tryPlay = async (url) => {
            if (!url || myLoadId !== currentLoadId) return; // 이전 로딩 루프 취소 (씹힘 방지)
            try {
                audio.src = url;
                audio.load();
                
                if (shouldPlay) {
                    $('#song-loading-overlay').css('display', 'flex');
                    currentPlayPromise = audio.play();
                    await currentPlayPromise;
                    $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    $('#song-loading-overlay').fadeOut(300);
                }
            } catch (e) {
                console.error(`Play failed for ${url}:`, e.name, e.message);
                
                if (e.name !== 'AbortError' && myLoadId === currentLoadId) { 
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
    function renderLyrics(lyricsArray) {
        const $scroll = $('#lyrics-scroll').empty();
        if (!lyricsArray || !lyricsArray.length) {
            $scroll.append('<div class="lyric-line" style="opacity:0.4;filter:none;">가사가 등록되지 않았습니다.</div>');
            return;
        }
        lyricsArray.forEach((l, i) => {
            $scroll.append(`<div class="lyric-line clickable" id="lrc-${i}" data-time="${l.time}">${l.text}</div>`);
        });
        $scroll.scrollTop(0);
    }

    function updateLyricsSync(time) {
        if (!currentPlayingSong || !currentPlayingSong.parsedLyrics || !currentPlayingSong.parsedLyrics.length) return;
        const syncOffset = currentPlayingSong.syncOffset || 0;
        const adjustedTime = time + syncOffset;
        const lyricsArray = currentPlayingSong.parsedLyrics;

        let activeIdx = -1;
        for (let i = 0; i < lyricsArray.length; i++) {
            if (adjustedTime >= lyricsArray[i].time) activeIdx = i;
            else break;
        }
            if (activeIdx !== -1 && activeIdx !== lastActiveLyricIdx) {
            $('.lyric-line').removeClass('active near');
            const $active = $(`#lrc-${activeIdx}`).addClass('active');
            if (activeIdx > 0) $(`#lrc-${activeIdx-1}`).addClass('near');
            if (activeIdx < lyricsArray.length - 1) $(`#lrc-${activeIdx+1}`).addClass('near');
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
            $container.append(`
                <div class="song-item ${isCurrent ? 'active' : ''}" data-index="${i}">
                    <img src="${song.coverUrl}" loading="lazy" alt="cover" onerror="this.src='${MusicEngine.placeholderImage}'">
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
            if (!playlistData.length) return;
            if (audio.paused) {
                // 브라우저 정책에 의해 로딩이 지연되었거나 멈춰있는 첫곡 강제 로딩
                if (!audio.src || audio.readyState === 0) {
                    playSongObject(playlistData[curIdx], true);
                    return;
                }
                
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    }).catch(e => {
                        console.error('Play error (User click):', e);
                        // 에러나면 사용자 이벤트 안에서 강제 재로딩하여 뚫기
                        playSongObject(playlistData[curIdx], true);
                    });
                }
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
            curIdx = n;
            playSongObject(playlistData[n], true);
        });

        /* Prev */
        $('#btn-prev').on('click', () => {
            if (!playlistData.length) return;
            if (audio.currentTime > 3) { audio.currentTime = 0; return; }
            curIdx = (curIdx - 1 + playlistData.length) % playlistData.length;
            playSongObject(playlistData[curIdx], true);
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
                // 2 = Repeat One, 1 = Repeat All, 0 = No Repeat
                if (repeatMode === 2) {
                    audio.currentTime = 0;
                    currentPlayPromise = audio.play();
                    currentPlayPromise.then(() => {
                        $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    }).catch(() => {});
                } else {
                    let nextIdx;
                    if (isShuffle) {
                        nextIdx = Math.floor(Math.random() * playlistData.length);
                        if (playlistData.length > 1 && nextIdx === curIdx) {
                            nextIdx = (nextIdx + 1) % playlistData.length;
                        }
                    } else {
                        nextIdx = curIdx + 1;
                    }
                    
                    if (nextIdx < playlistData.length) {
                        curIdx = nextIdx;
                        playSongObject(playlistData[nextIdx], true);
                    } else if (repeatMode === 1) {
                        curIdx = 0;
                        playSongObject(playlistData[0], true);
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
            e.stopPropagation();
            const time = parseFloat($(this).data('time'));
            if (!isNaN(time) && audio.duration) {
                const targetTime = Math.max(0, time + 0.05); // 약간 뒤로 점프
                audio.currentTime = targetTime;
                updateLyricsSync(targetTime); 
                
                if (audio.paused) {
                    currentPlayPromise = audio.play();
                    currentPlayPromise.then(() => {
                        $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
                    }).catch(err => console.error("Lyrics seek play failed:", err));
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
        let chatInterval = null;
        async function fetchChats() {
            try {
                const chats = await window.CloudflareAPI.D1.getChat();
                const $box = $('#chat-messages').empty();
                if (chats.length === 0) {
                    $box.append('<div class="msg-bubble" style="background:#555;">채팅방이 생성되었습니다. 첫 메시지를 남겨보세요!</div>');
                }
                chats.forEach(c => {
                    const isMine = (c.uid === userId);
                    const timeStr = new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    $box.append(`
                        <div class="msg-bubble ${isMine ? 'mine' : ''}">
                            <div class="txt">${c.content}</div>
                            <div class="time">${timeStr}</div>
                        </div>
                    `);
                });
                $box.scrollTop($box[0].scrollHeight);
            } catch(e) {
                console.error("Chat load error:", e);
            }
        }

        $('#btn-open-chat').on('click', () => {
            closeAllModals();
            $('#modal-container, #chat-popup').addClass('active');
            fetchChats();
            if (chatInterval) clearInterval(chatInterval);
            chatInterval = setInterval(fetchChats, 3000);
        });

        /* Inquiry */
        $('#btn-inquiry').on('click', () => {
            closeAllModals();
            $('#modal-container, #inquiry-popup').addClass('active');
            $('#inq-title').val(''); $('#inq-content').val(''); $('#inq-contact').val('');
        });

        /* Admin Login */
        $('#btn-admin-login').on('click', () => {
            closeAllModals();
            $('#modal-container, #admin-popup').addClass('active');
        });

        /* Startup Popup (광고/공지) */
        $('#btn-popup-close').on('click', () => {
            $('#startup-popup-overlay').fadeOut(200);
        });

        $('#btn-popup-hide-today').on('click', () => {
            // 30시간 = 30 * 60 * 60 * 1000 밀리초
            const thirtyHoursMs = 30 * 60 * 60 * 1000;
            const hideUntil = Date.now() + thirtyHoursMs;
            localStorage.setItem('andre_youth_popup_hide', hideUntil.toString());
            $('#startup-popup-overlay').fadeOut(200);
        });

        /* Send Chat */
        $('#btn-send-chat').on('click', sendChat);
        $('#chat-input').on('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
        async function sendChat() {
            const txt = $('#chat-input').val().trim();
            if (!txt) return;
            $('#chat-input').val('');
            try {
                await window.CloudflareAPI.D1.sendChat({
                    id: 'chat_' + Date.now() + Math.random().toString(36).substr(2,5),
                    content: txt,
                    uid: userId
                });
                fetchChats();
            } catch(e) {
                alert('메시지 전송 실패: ' + e.message);
            }
        }

        /* Submit Inquiry */
        $('#btn-submit-inquiry').on('click', async () => {
            const title = $('#inq-title').val().trim();
            const content = $('#inq-content').val().trim();
            const contact = $('#inq-contact').val().trim();
            
            if (!title || !content) {
                return alert('제목과 내용을 입력해주세요.');
            }
            
            try {
                await window.CloudflareAPI.D1.sendInquiry({
                    id: 'inq_' + Date.now(),
                    title: title,
                    content: content,
                    contact: contact
                });
                alert('문의가 성공적으로 접수되었습니다.');
                closeAllModals();
            } catch(e) {
                alert('접수 실패: ' + e.message);
            }
        });

        $('#btn-do-login').on('click', async () => {
            const id = $('#admin-id').val().trim();
            const pw = $('#admin-password').val().trim();
            
            if (!id || !pw) return alert('아이디와 비밀번호를 입력하세요.');
            
            try {
                const res = await window.CloudflareAPI.D1.login({ id: id, password: pw });
                if (res.success && res.user) {
                    localStorage.setItem('adminUser', JSON.stringify({ 
                        id: res.user.id, name: res.user.name, isApproved: true, isAdmin: res.user.role === 'admin' 
                    }));
                    closeAllModals();
                    window.location.href = 'admin.html';
                } else {
                    alert('로그인 실패: ' + (res.error || '알 수 없는 오류'));
                }
            } catch(e) {
                alert('서버 통신 오류: ' + e.message);
            }
        });

        $('#btn-do-signup').on('click', async () => {
            const id = $('#signup-id').val().trim();
            const pw = $('#signup-password').val().trim();
            const name = $('#signup-name').val() ? $('#signup-name').val().trim() : id;
            
            if (!id || !pw) return alert('아이디와 비밀번호를 입력하세요.');
            
            try {
                const res = await window.CloudflareAPI.D1.signup({ id: id, password: pw, name: name });
                if (res.success) {
                    alert('가입 신청이 완료되었습니다. 메인 관리자의 승인을 기다려주세요.');
                    toggleAuthMode(false); // 로그인 모드로 전환
                } else {
                    alert('가입 실패: ' + (res.error || '알 수 없는 오류'));
                }
            } catch(e) {
                alert('서버 통신 오류: ' + e.message);
            }
        });

        /* Song item click */
        $(document).on('click', '.song-item', function() {
            const index = $(this).data('index');
            if (index !== undefined && playlistData[index]) {
                curIdx = index;
                playSongObject(playlistData[index], true);
            }
            $('#playlist-sheet').removeClass('active');
        });

        /* Close Modals */
        function closeAllModals() { 
            $('.modal-overlay, .floating-popup').removeClass('active'); 
            if (typeof chatRef !== 'undefined' && chatRef) chatRef.off('child_added');
            if (typeof chatInterval !== 'undefined' && chatInterval) {
                clearInterval(chatInterval);
                chatInterval = null;
            }
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
