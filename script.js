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

    /* ─── Shorts State ─── */
    let isShortsMode = false;
    let isShortsMuted = false;
    let shortsList = [];
    let shortsOrder = []; // 셔플된 재생 순서 인덱스 배열
    let curShortsOrderIdx = 0; // 현재 셔플 순서 상의 인덱스
    let likedShorts = JSON.parse(localStorage.getItem('andre_liked_shorts') || '[]');
    let isShortsTransitioning = false;
    let viewedShorts = []; // 이번 세션에서 조회수 카운트 완료한 쇼츠 ID 배열
    let shortsViewTimer = null; // 3초 시청 카운트다운 타이머
    
    // 터치 스와이프용 변수
    let touchStartY = 0;
    let touchEndY = 0;

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
                    const isPopupActive = settings && (settings.popupEnabled === true || settings.popupEnabled === 'true' || settings.popupEnabled === 1 || settings.popupEnabled === '1');
                    if (isPopupActive && settings.popupImageUrl) {
                        const hideUntil = localStorage.getItem('andre_youth_popup_hide');
                        const now = Date.now();
                        if (!hideUntil || now > parseInt(hideUntil)) {
                            $('#startup-popup-img').attr('src', settings.popupImageUrl);
                            $('#startup-popup-overlay').css('display', 'flex');
                        }
                    } else {
                        $('#startup-popup-overlay').hide();
                    }
                }
                initPromoBanner();
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

        // Media Session API 설정 (백그라운드/잠금화면 컨트롤 지원)
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title || 'Unknown Title',
                artist: song.artist || 'Andre Youth',
                album: 'Andre Youth Playlist',
                artwork: [
                    { src: song.coverUrl || MusicEngine.placeholderImage, sizes: '96x96', type: 'image/jpeg' },
                    { src: song.coverUrl || MusicEngine.placeholderImage, sizes: '128x128', type: 'image/jpeg' },
                    { src: song.coverUrl || MusicEngine.placeholderImage, sizes: '192x192', type: 'image/jpeg' },
                    { src: song.coverUrl || MusicEngine.placeholderImage, sizes: '256x256', type: 'image/jpeg' },
                    { src: song.coverUrl || MusicEngine.placeholderImage, sizes: '384x384', type: 'image/jpeg' },
                    { src: song.coverUrl || MusicEngine.placeholderImage, sizes: '512x512', type: 'image/jpeg' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', function() {
                audio.play();
                $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
            });
            navigator.mediaSession.setActionHandler('pause', function() {
                audio.pause();
                $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
            });
            navigator.mediaSession.setActionHandler('previoustrack', function() {
                $('#btn-prev').click();
            });
            navigator.mediaSession.setActionHandler('nexttrack', function() {
                $('#btn-next').click();
            });
        }

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
                    // JWT 보안 토큰 저장
                    if (res.token) {
                        localStorage.setItem('andre_youth_admin_token', res.token);
                    }
                    localStorage.setItem('adminUser', JSON.stringify({ 
                        id: res.user.id, name: res.user.name, isApproved: true, isAdmin: res.user.role === 'admin' 
                    }));
                    // 세션 활동 및 토큰 발급 타임스탬프 초기화
                    localStorage.setItem('andre_admin_last_activity', Date.now().toString());
                    localStorage.setItem('andre_token_issued_at', Date.now().toString());
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
            const phone = $('#signup-phone').val() ? $('#signup-phone').val().trim() : '';
            const company = $('#signup-company').val() ? $('#signup-company').val().trim() : '';
            const position = $('#signup-position').val() ? $('#signup-position').val().trim() : '';
            
            if (!id || !pw) return alert('아이디와 비밀번호를 입력하세요.');
            
            try {
                const res = await window.CloudflareAPI.D1.signup({ 
                    id: id, 
                    password: pw, 
                    name: name,
                    phone: phone,
                    company: company,
                    position: position
                });
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

        /* === Shorts Mode Toggle === */
        $('#shorts-mode-toggle').on('change', function() {
            isShortsMode = $(this).is(':checked');
            if (isShortsMode) {
                // 기존 음악 일시정지
                if (audio && !audio.paused) {
                    audio.pause();
                    $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
                }
                $('#app-container').hide();
                $('#shorts-container').removeClass('shorts-hidden');
                initShortsMode();
            } else {
                // 쇼츠 비디오 일시정지 및 숨김
                stopAllShortsVideos();
                $('#shorts-container').addClass('shorts-hidden');
                $('#app-container').show();
            }
        });

        /* === Shorts Exit to Playlist === */
        $('#btn-exit-shorts-mode').on('click', function() {
            $('#shorts-mode-toggle').prop('checked', false).trigger('change');
        });

        /* === Shorts Mute Toggle === */
        $('#shorts-mute-btn').on('click', function(e) {
            e.stopPropagation();
            isShortsMuted = !isShortsMuted;
            const video = $('.shorts-slide').find('.shorts-video')[0];
            if (video) {
                video.muted = isShortsMuted;
                if (!isShortsMuted) video.volume = 1.0;
            }
            updateShortsMuteUI();
        });

        /* === YouTube-Style Shorts Swipe Engine === */
        const $shortsContainer = $('#shorts-container');
        const $shortsViewport = $shortsContainer.find('.shorts-viewport');
        let swipeTouchStartY = 0;
        let swipeTouchDeltaY = 0;
        let swipeIsDragging = false;
        let swipeStartTime = 0;

        // --- Mobile Touch: real-time drag with visual feedback ---
        $shortsViewport[0].addEventListener('touchstart', function(e) {
            if (isShortsTransitioning) return;
            // Ignore if user is interacting with the seek slider
            if ($(e.target).closest('#shorts-progress-zone, .shorts-action-btn, .shorts-mode-pill-btn').length) return;
            swipeTouchStartY = e.touches[0].clientY;
            swipeTouchDeltaY = 0;
            swipeIsDragging = true;
            swipeStartTime = Date.now();
            const $slide = $shortsViewport.find('.shorts-slide');
            $slide.css('transition', 'none');
        }, { passive: true });

        $shortsViewport[0].addEventListener('touchmove', function(e) {
            if (!swipeIsDragging || isShortsTransitioning) return;
            swipeTouchDeltaY = e.touches[0].clientY - swipeTouchStartY;
            const $slide = $shortsViewport.find('.shorts-slide');
            // Dampen overscroll at edges
            let translateY = swipeTouchDeltaY;
            const isAtStart = curShortsOrderIdx <= 0 && swipeTouchDeltaY > 0;
            if (isAtStart) translateY = swipeTouchDeltaY * 0.3; // rubber-band effect
            $slide.css('transform', `translateY(${translateY}px)`);
        }, { passive: true });

        $shortsViewport[0].addEventListener('touchend', function(e) {
            if (!swipeIsDragging || isShortsTransitioning) return;
            swipeIsDragging = false;
            const elapsed = Date.now() - swipeStartTime;
            const velocity = Math.abs(swipeTouchDeltaY) / Math.max(elapsed, 1);
            const threshold = velocity > 0.4 ? 30 : 80; // fast flick = lower threshold

            if (swipeTouchDeltaY < -threshold && shortsList.length > 0) {
                navigateShorts('next');
            } else if (swipeTouchDeltaY > threshold && curShortsOrderIdx > 0) {
                navigateShorts('prev');
            } else {
                // Snap back to current position
                const $slide = $shortsViewport.find('.shorts-slide');
                $slide.css({ transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)', transform: 'translateY(0)' });
            }
        }, { passive: true });

        // --- PC: Mouse Wheel (debounced snap scroll) ---
        let wheelCooldown = false;
        $shortsContainer[0].addEventListener('wheel', function(e) {
            if (wheelCooldown || isShortsTransitioning || !shortsList.length) return;
            e.preventDefault();
            wheelCooldown = true;
            if (e.deltaY > 30) {
                navigateShorts('next');
            } else if (e.deltaY < -30) {
                navigateShorts('prev');
            }
            setTimeout(() => { wheelCooldown = false; }, 500);
        }, { passive: false });

        // --- PC: Keyboard Arrow Keys ---
        $(document).on('keydown.shorts', function(e) {
            if (!$shortsContainer.is(':visible') || isShortsTransitioning || !shortsList.length) return;
            // Don't hijack if user is typing in an input
            if ($(e.target).is('input, textarea, select')) return;
            if (e.key === 'ArrowDown' || e.key === 'j') {
                e.preventDefault();
                navigateShorts('next');
            } else if (e.key === 'ArrowUp' || e.key === 'k') {
                e.preventDefault();
                navigateShorts('prev');
            }
        });

        // 비디오 터치 시 재생/일시정지 토글
        $(document).on('click', '.shorts-video', function() {
            const video = this;
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });

        // 쇼츠 좋아요 버튼
        $('#shorts-like-btn').on('click', async function(e) {
            e.stopPropagation();
            if (!shortsList.length || isShortsTransitioning) return;
            const curShorts = shortsList[shortsOrder[curShortsOrderIdx]];
            if (!curShorts) return;

            const id = curShorts.id;
            const isLiked = likedShorts.includes(id);
            
            try {
                // D1 API 호출하여 좋아요 수 올림
                const res = await window.CloudflareAPI.D1.likeShorts(id);
                if (res.success) {
                    if (!isLiked) {
                        likedShorts.push(id);
                        localStorage.setItem('andre_liked_shorts', JSON.stringify(likedShorts));
                    }
                    $('#shorts-like-count').text(res.likes);
                    updateShortsLikeUI(true);
                }
            } catch(err) {
                console.error("Like error:", err);
            }
        });

        // 쇼츠 댓글 버튼 (바텀 시트 열기)
        $('#shorts-comment-btn').on('click', function(e) {
            e.stopPropagation();
            if (!shortsList.length) return;
            const curShorts = shortsList[shortsOrder[curShortsOrderIdx]];
            if (!curShorts) return;

            $('#shorts-comments-sheet').addClass('active');
            fetchShortsComments(curShorts.id);
        });

        // 바텀 시트 닫기
        $('.bottom-sheet-close, .bottom-sheet-backdrop').on('click', function() {
            $('#shorts-comments-sheet').removeClass('active');
        });

        // 댓글 전송
        $('#shorts-comment-send').on('click', function() {
            sendShortsComment();
        });

        $('#shorts-comment-input').on('keypress', function(e) {
            if (e.which === 13) sendShortsComment();
        });

        // 쇼츠 공유 버튼
        $('#shorts-share-btn').on('click', function(e) {
            e.stopPropagation();
            if (!shortsList.length) return;
            const curShorts = shortsList[shortsOrder[curShortsOrderIdx]];
            if (!curShorts) return;

            // 백그라운드 공유수 집계 API 호출
            if (window.CloudflareAPI && window.CloudflareAPI.D1 && window.CloudflareAPI.D1.shareShorts) {
                window.CloudflareAPI.D1.shareShorts(curShorts.id).catch(() => {});
            }

            const shareUrl = `${window.location.origin}${window.location.pathname}#shorts/${curShorts.id}`;
            
            if (navigator.share) {
                navigator.share({
                    title: curShorts.title,
                    text: curShorts.description || 'ANDREW YOUTH Shorts',
                    url: shareUrl
                }).catch(() => {});
            } else {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    alert('공유 링크가 클립보드에 복사되었습니다!');
                }).catch(() => {
                    alert('링크 복사에 실패했습니다. 수동으로 복사해 주세요: ' + shareUrl);
                });
            }
        });
    }

    function syncFavoriteState() {
        const song = playlistData[curIdx];
        if (!song) return;
        const isFav = favorites.includes(song.id || song.title);
        $('#btn-scrap i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        $('#btn-scrap').toggleClass('active', isFav);
    }

    /* ─── Shorts Mode Logic ─── */
    async function initShortsMode() {
        if (!window.CloudflareAPI || !window.CloudflareAPI.D1) return;

        try {
            const data = await window.CloudflareAPI.D1.getShorts();
            shortsList = data || [];
            
            if (shortsList.length === 0) {
                $('.shorts-viewport').hide();
                $('.shorts-empty-state').show();
                return;
            }

            $('.shorts-empty-state').hide();
            $('.shorts-viewport').show();

            // 셔플 알고리즘 적용
            shuffleShortsList();

            // URL 해시(#shorts/아이디) 탐색 시 해당 쇼츠를 가장 먼저 재생하도록 순서 조정
            const hash = window.location.hash;
            if (hash && hash.startsWith('#shorts/')) {
                const targetId = hash.replace('#shorts/', '');
                const foundIdx = shortsList.findIndex(s => s.id === targetId);
                if (foundIdx !== -1) {
                    // targetId를 가진 인덱스를 셔플 순서의 맨 앞으로 보냄
                    const orderIdx = shortsOrder.indexOf(foundIdx);
                    if (orderIdx !== -1) {
                        shortsOrder.splice(orderIdx, 1);
                        shortsOrder.unshift(foundIdx);
                    }
                }
            }

            curShortsOrderIdx = 0;
            playShortsVideo(shortsOrder[curShortsOrderIdx]);

        } catch (err) {
            console.error("Fetch shorts error:", err);
            $('.shorts-viewport').hide();
            $('.shorts-empty-state').show().find('p').text('영상 목록을 가져오지 못했습니다.');
        }
    }

    // Fisher-Yates 셔플 알고리즘
    function shuffleShortsList() {
        shortsOrder = Array.from({ length: shortsList.length }, (_, i) => i);
        for (let i = shortsOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shortsOrder[i], shortsOrder[j]] = [shortsOrder[j], shortsOrder[i]];
        }
    }

    function playShortsVideo(idx) {
        if (idx === undefined || !shortsList[idx]) return;
        const shorts = shortsList[idx];

        const $slide = $('.shorts-slide');
        const video = $slide.find('.shorts-video')[0];

        // 비디오 소스 주입
        video.src = shorts.videoUrl;
        video.load();

        // 메타데이터 정보 렌더링
        $slide.find('.shorts-title').text(shorts.title || '제목 없음');
        $slide.find('.shorts-desc').text(shorts.description || '');
        $('#shorts-like-count').text(shorts.likes || 0);

        // 좋아요 상태 UI 반영
        const isLiked = likedShorts.includes(shorts.id);
        updateShortsLikeUI(isLiked);

        // 비디오 소리 기본 켜짐 설정 및 재생
        video.muted = isShortsMuted;
        video.volume = 1.0;
        updateShortsMuteUI();

        video.play().catch(e => {
            console.log("Unmuted auto-play blocked by browser policy, fallback to muted auto-play first.", e);
            video.muted = true;
            video.play().catch(() => {});
        });

        // 댓글 갯수 가져오기
        fetchShortsCommentsCount(shorts.id);

        // 해시 업데이트 (현재 재생영상 ID 기록)
        window.location.hash = `shorts/${shorts.id}`;

        // 다음 영상 미리 로드 (프리로딩)
        preloadNextVideo();

        // 쇼츠 비디오 하단 탐색 진행바(Scrubber) 실시간 연동
        bindShortsScrubber(video);

        // 3초 이상 시청 시 조회수 집계 타이머
        if (shortsViewTimer) clearTimeout(shortsViewTimer);
        if (!viewedShorts.includes(shorts.id)) {
            shortsViewTimer = setTimeout(() => {
                if (window.CloudflareAPI && window.CloudflareAPI.D1 && window.CloudflareAPI.D1.viewShorts) {
                    window.CloudflareAPI.D1.viewShorts(shorts.id)
                        .then(() => { viewedShorts.push(shorts.id); })
                        .catch(() => {});
                }
            }, 3000);
        }
    }

    function preloadNextVideo() {
        const nextOrderIdx = (curShortsOrderIdx + 1) % shortsList.length;
        const nextShorts = shortsList[shortsOrder[nextOrderIdx]];
        if (nextShorts && nextShorts.videoUrl) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'video';
            link.href = nextShorts.videoUrl;
            // 이전 프리로드 링크가 있다면 삭제하여 무리 방지
            $('head link[rel="preload"][as="video"]').remove();
            document.head.appendChild(link);
        }
    }

    function stopAllShortsVideos() {
        if (shortsViewTimer) clearTimeout(shortsViewTimer);
        const video = $('.shorts-slide').find('.shorts-video')[0];
        if (video) {
            video.pause();
            video.src = '';
        }
    }

    /* === YouTube-Style Shorts Navigation Engine === */
    function navigateShorts(direction) {
        if (!shortsList.length || isShortsTransitioning) return;

        if (direction === 'next') {
            isShortsTransitioning = true;
            curShortsOrderIdx++;
            if (curShortsOrderIdx >= shortsList.length) {
                shuffleShortsList();
                curShortsOrderIdx = 0;
            }
            smoothShortsTransition('up', () => {
                playShortsVideo(shortsOrder[curShortsOrderIdx]);
                isShortsTransitioning = false;
            });
        } else if (direction === 'prev') {
            if (curShortsOrderIdx > 0) {
                isShortsTransitioning = true;
                curShortsOrderIdx--;
                smoothShortsTransition('down', () => {
                    playShortsVideo(shortsOrder[curShortsOrderIdx]);
                    isShortsTransitioning = false;
                });
            } else {
                // Rubber-band snap back at top
                const $slide = $('.shorts-slide');
                $slide.css({ transition: 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)', transform: 'translateY(0)' });
            }
        }
    }

    function smoothShortsTransition(direction, callback) {
        const $slide = $('.shorts-slide');
        const viewportH = $slide.parent().height() || window.innerHeight;
        const exitY = direction === 'up' ? -viewportH : viewportH;

        // Phase 1: Slide current video OUT
        $slide.css({
            transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            transform: `translateY(${exitY}px)`
        });

        setTimeout(() => {
            // Phase 2: Load new video (callback), reset position instantly
            if (callback) callback();

            // Instantly jump to entrance position (no transition)
            const enterY = direction === 'up' ? viewportH : -viewportH;
            $slide.css({ transition: 'none', transform: `translateY(${enterY}px)` });

            // Phase 3: Slide new video IN (next frame)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    $slide.css({
                        transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                        transform: 'translateY(0)'
                    });
                });
            });
        }, 300);
    }

    function updateShortsLikeUI(isLiked) {
        const $icon = $('#shorts-like-btn i');
        if (isLiked) {
            $icon.attr('class', 'fa-solid fa-heart');
        } else {
            $icon.attr('class', 'fa-regular fa-heart');
        }
    }

    function updateShortsMuteUI() {
        const $icon = $('#shorts-mute-icon');
        const $label = $('#shorts-mute-label');
        if (isShortsMuted) {
            $icon.removeClass('fa-volume-high').addClass('fa-volume-xmark');
            $label.text('음소거');
        } else {
            $icon.removeClass('fa-volume-xmark').addClass('fa-volume-high');
            $label.text('소리켬');
        }
    }

    let isShortsScrubbing = false;
    function bindShortsScrubber(video) {
        if (!video) return;
        const $slider = $('#shorts-seek-slider');
        const $curTime = $('#shorts-cur-time');
        const $durTime = $('#shorts-dur-time');

        $(video).off('timeupdate.shorts').on('timeupdate.shorts', function() {
            if (isShortsScrubbing || !video.duration || isNaN(video.duration)) return;
            const pct = (video.currentTime / video.duration) * 100;
            $slider.val(pct);
            $curTime.text(formatTime(video.currentTime));
            $durTime.text(formatTime(video.duration));
        });

        $slider.off('input.shorts change.shorts').on('input.shorts', function() {
            isShortsScrubbing = true;
            if (video.duration && !isNaN(video.duration)) {
                $curTime.text(formatTime((this.value / 100) * video.duration));
            }
        }).on('change.shorts', function(e) {
            e.stopPropagation();
            if (video.duration && !isNaN(video.duration)) {
                video.currentTime = (this.value / 100) * video.duration;
            }
            isShortsScrubbing = false;
        });

        $('#shorts-progress-zone').off('click.shorts').on('click.shorts', function(e) {
            e.stopPropagation();
        });
    }

    async function initPromoBanner() {
        try {
            let config = null;
            if (window.CloudflareAPI && window.CloudflareAPI.D1) {
                config = await window.CloudflareAPI.D1.getSettings().catch(() => null);
            }
            const isPromoActive = config && (config.promoActive === true || config.promoActive === 'true' || config.promoActive === 1 || config.promoActive === '1');
            if (!isPromoActive) {
                $('#promo-banner-card, #shorts-promo-banner').addClass('hidden').hide();
                return;
            }

            let badgeText = "D-DAY";
            if (config.promoDate) {
                const target = new Date(config.promoDate);
                target.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                    badgeText = `D-${diffDays}`;
                } else if (diffDays === 0) {
                    badgeText = `D-DAY`;
                } else {
                    badgeText = `D+${Math.abs(diffDays)}`;
                }
            }

            $('#promo-dday-badge, #shorts-promo-dday-badge').text(badgeText);
            $('#promo-main-title, #shorts-promo-main-title').text(config.promoTitle || '');
            $('#promo-sub-text, #shorts-promo-sub-text').text(config.promoText || '');
            $('#promo-banner-card, #shorts-promo-banner').removeClass('hidden').css('display', 'flex');
        } catch (e) {
            console.log('Promo banner load info:', e.message);
        }
    }

    async function fetchShortsCommentsCount(shortsId) {
        try {
            const comments = await window.CloudflareAPI.D1.getShortsComments(shortsId);
            $('#shorts-comment-count').text(comments.length || 0);
        } catch (e) {
            $('#shorts-comment-count').text(0);
        }
    }

    async function fetchShortsComments(shortsId) {
        const $list = $('#shorts-comments-list').empty().append('<div class="loading-spinner">댓글 불러오는 중...</div>');
        try {
            const comments = await window.CloudflareAPI.D1.getShortsComments(shortsId);
            $list.empty();
            if (comments.length === 0) {
                $list.append('<div class="loading-spinner" style="font-size: 13px;">첫 댓글을 작성해 보세요!</div>');
                return;
            }

            comments.forEach(c => {
                const date = new Date(c.timestamp);
                const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                $list.append(`
                    <div class="comment-item">
                        <div class="comment-meta">
                            <span class="comment-author">${c.nickname}</span>
                            <span class="comment-time">${timeStr}</span>
                        </div>
                        <div class="comment-content">${c.content}</div>
                    </div>
                `);
            });
            $list.scrollTop($list[0].scrollHeight);
        } catch(e) {
            $list.html('<div style="color:red; font-size:13px; text-align:center;">불러오기 실패</div>');
        }
    }

    async function sendShortsComment() {
        if (!shortsList.length) return;
        const curShorts = shortsList[shortsOrder[curShortsOrderIdx]];
        if (!curShorts) return;

        const nickname = $('#shorts-comment-nickname').val().trim() || '익명';
        const content = $('#shorts-comment-input').val().trim();
        if (!content) return;

        $('#shorts-comment-input').val('');
        const commentId = 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        try {
            const res = await window.CloudflareAPI.D1.addShortsComment(curShorts.id, {
                id: commentId,
                content: content,
                nickname: nickname
            });
            if (res.success) {
                fetchShortsComments(curShorts.id);
                fetchShortsCommentsCount(curShorts.id);
            }
        } catch(e) {
            alert('댓글 전송 실패: ' + e.message);
        }
    }

    init();
});
