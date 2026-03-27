$(document).ready(function() {
    // [보존] Firebase 초기화
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
    const db = firebase.database();

    const audio = document.getElementById('audio-engine');
    let curIdx = -1, isShuffle = false, repeatMode = 0;
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatUserId', userId);
    let myLikedMsgs = JSON.parse(localStorage.getItem('myLikedMsgs')) || [];

    const GAS_URL = "https://script.google.com/macros/s/AKfycbwqK78wbvPYHSxbwl6Fyu43ystWSU824EFiwM3ZJGvusGhQW99eWJBEUY1vrOub3sQTbg/exec";
    let playlistData = []; 

    // [자동화] 구글 드라이브에서 리스트 실시간 로드
    async function fetchPlaylist() {
        try {
            $('#disp-title').text('동기화 중...');
            const response = await fetch(`${GAS_URL}?v=${Date.now()}`);
            const data = await response.json();
            if (data && data.length > 0) {
                playlistData = data;
                render();
                renderCopyright(); // 저작권 목록 자동 생성
                load(0); // 첫 곡 로드
            } else {
                $('#disp-title').text('곡을 추가해주세요.');
            }
        } catch (error) {
            console.error("Playlist Fetch Error:", error);
            $('#disp-title').text('데이터 로드 실패');
        }
    }

    // [추가] 저작권 목록 동적 생성
    function renderCopyright() {
        const $list = $('#dynamic-copy-list').empty();
        playlistData.forEach((s, i) => {
            $list.append(`
                <div class="copy-item">
                    <span class="copy-title">${i + 1}. ${s.title}</span>
                    <span style="font-size:0.75rem; opacity:0.6;">Andre Youth</span>
                </div>
            `);
        });
    }

    // [추가] 가사 로드 및 파싱 기능
    let currentLyrics = [];
    async function fetchLyrics(url) {
        if (!url) { $('#lyrics-scroll-area').html('<div class="lyric-line no-data">등록된 가사가 없습니다.</div>'); currentLyrics = []; return; }
        try {
            const resp = await fetch(url);
            const text = await resp.text();
            currentLyrics = MusicEngine.parseLyrics(text);
            renderLyrics();
        } catch (e) {
            console.error("Lyrics Error:", e);
            $('#lyrics-scroll-area').html('<div class="lyric-line no-data">가사를 불러올 수 없습니다.</div>');
        }
    }

    function renderLyrics() {
        const $area = $('#lyrics-scroll-area').empty();
        if (currentLyrics.length === 0) {
            $area.append('<div class="lyric-line no-data">가사 데이터 형식이 맞지 않습니다.</div>');
            return;
        }
        currentLyrics.forEach((l, i) => {
            $area.append(`<div class="lyric-line" id="lyric-${i}" data-time="${l.time}" style="cursor:pointer;">${l.text}</div>`);
        });

        // 가사 클릭 시 해당 시간으로 이동
        $('.lyric-line').off('click').on('click', function() {
            const time = parseFloat($(this).data('time'));
            if (!isNaN(time)) {
                audio.currentTime = time;
                if (audio.paused) audio.play();
            }
        });
    }

    // [개선] 사운드바 활성화 로직
    let sbTimer;
    function openSb() {
        $('#main-header').addClass('mode-volume');
        clearTimeout(sbTimer);
        sbTimer = setTimeout(() => $('#main-header').removeClass('mode-volume'), 3500);
    }

    $('#btn-vol-trigger').on('click touchstart', function(e) { e.stopPropagation(); openSb(); });
    $('#btn-vol-close').on('click touchstart', function(e) { e.stopPropagation(); $('#main-header').removeClass('mode-volume'); });
    $('#sb-volume-slider').on('input', function() { audio.volume = $(this).val() / 100; openSb(); });
    
    $('#btn-play-pause').on('click touchstart', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (audio.paused) audio.play(); else audio.pause();
    });

    // [보존] 하트 연동 로직
    function syncHearts() {
        const curTitle = playlistData[curIdx]?.title;
        const isFav = scrappedSongs.includes(curTitle);
        $('#btn-scrap').toggleClass('active', isFav).find('i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        $('#song-list-ul li').each(function(i) {
            const isSet = scrappedSongs.includes(playlistData[i].title);
            $(this).find('.list-heart-btn').toggleClass('active', isSet).find('i').attr('class', isSet ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        });
    }

    function toggleFav(title) {
        const idx = scrappedSongs.indexOf(title);
        if (idx === -1) scrappedSongs.push(title); else scrappedSongs.splice(idx, 1);
        localStorage.setItem('myScraps', JSON.stringify(scrappedSongs));
        syncHearts();
    }

    // [보존] 재생 로직
    function load(i, play = false) {
        if(i < 0 || i >= playlistData.length) return;
        curIdx = i; const s = playlistData[i];
        
        // 음원 및 이미지 주소 정밀 변환 적용
        const ts = new Date().getTime();
        const fixedAudio = MusicEngine.fixUrl(s.url, 'audio'); // confirm=t 포함
        const fixedCover = MusicEngine.fixUrl(s.cover, 'image'); // lh3 서버
        
        audio.src = fixedAudio; 
        audio.removeAttribute('crossorigin'); // 보안 정책 우회를 위해 필수!
        audio.load();

        // 앨범 아트 및 배경 업데이트
        $('#album-img').attr('src', fixedCover);
        $('#bg-image').css('background-image', `url('${fixedCover}')`);
        $('#album-trigger').removeClass('show-lyrics').css('background-image', `url('${fixedCover}')`);
        $('#disp-title').text(s.title);
        
        // [CORS 우회] 백엔드에서 통합된 가사 데이터를 즉시 파싱하여 렌더링
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
                console.error("Playback System Error:", e.name, e.message);
                if (e.name === "NotAllowedError") {
                    $('#disp-title').text("화면을 클릭하면 재생됩니다.");
                }
            });
        }
    }

    function next() { let n = isShuffle ? Math.floor(Math.random()*playlistData.length) : (curIdx+1)%playlistData.length; load(n, true); }
    audio.onended = () => repeatMode === 2 ? (audio.currentTime=0, audio.play()) : next();
    audio.onplay = () => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
    $('#btn-next').click(next);
    $('#btn-prev').click(() => load((curIdx-1+playlistData.length)%playlistData.length, true));
    $('#btn-shuffle').click(function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle); });
    $('#btn-repeat').click(function() { repeatMode = (repeatMode + 1) % 3; $(this).toggleClass('active', repeatMode > 0); });
    $('#btn-scrap').click(() => toggleFav(playlistData[curIdx].title));

    // [보존] 팝업 및 스와이프 바텀시트
    $('#btn-open-chat').click(() => $('#chat-overlay').addClass('active'));
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
    $('#btn-upload').click(() => $('#upload-overlay').addClass('active'));
    
    // [UI 개선] 앨범 클릭 시 '사진 영역 내에서만' 가사 전환
    $('#album-trigger').click(function() {
        $(this).toggleClass('show-lyrics');
        // 가사로 전환될 때 현재 시간 가사로 즉시 스크롤
        if ($(this).hasClass('show-lyrics')) {
            updateLyricsUI(audio.currentTime);
        }
    });
    
    $('.close-x').click(function() { $(this).closest('.ios-popup').removeClass('active'); });
    
    let sheetStartY = 0;
    $('#sheet-trigger').on('touchstart', (e) => { sheetStartY = e.touches[0].clientY; });
    $('#sheet-trigger').on('touchmove', (e) => {
        let diff = sheetStartY - e.touches[0].clientY;
        if(diff > 40) $('#sheet').addClass('expanded'); else if(diff < -40) $('#sheet').removeClass('expanded');
    });
    $('#sheet-trigger').click(() => $('#sheet').toggleClass('expanded'));

    // [보존] 채팅 좋아요 기능
    if (typeof firebase !== 'undefined') {
        const chatDb = db.ref('messages');
        $('#btn-send-chat').click(() => {
            const t = $('#chat-input').val().trim();
            if(t) { chatDb.push({text: t, sender: userId, timestamp: Date.now(), likeCount: 0}); $('#chat-input').val(''); }
        });
        chatDb.limitToLast(30).on('child_added', (snap) => {
            const key = snap.key, m = snap.val(), isMe = m.sender === userId, iLike = myLikedMsgs.includes(key);
            $('#chat-messages').append(`
                <div class="msg-row" style="display:flex; justify-content:${isMe?'flex-end':'flex-start'}; width:100%;">
                    <div style="display:flex; align-items:flex-end; max-width:85%; flex-direction:${isMe?'row-reverse':'row'};">
                        <div class="message ${isMe?'me':'other'}" style="background:${isMe?'var(--primary)':'#fff'}; color:${isMe?'#fff':'#333'}; padding:10px 15px; border-radius:15px;">${m.text}</div>
                        <button class="msg-like-btn ${iLike?'liked':''}" data-key="${key}">
                            <i class="${iLike?'fa-solid':'fa-regular'} fa-heart"></i>
                            <span class="like-count">${m.likeCount||''}</span>
                        </button>
                    </div>
                </div>`);
            $('.chat-viewport').scrollTop($('.chat-viewport')[0].scrollHeight);
        });
        $(document).on('click', '.msg-like-btn', function() {
            const key = $(this).data('key'), isLiked = $(this).hasClass('liked');
            chatDb.child(key).transaction(p => { if (p) p.likeCount = (p.likeCount || 0) + (isLiked ? -1 : 1); return p; });
            if (isLiked) myLikedMsgs = myLikedMsgs.filter(k => k !== key); else myLikedMsgs.push(key);
            localStorage.setItem('myLikedMsgs', JSON.stringify(myLikedMsgs));
            $(this).toggleClass('liked', !isLiked).find('i').attr('class', !isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        });
    }

    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            $ul.append(`<li class="${i===curIdx?'active':''}" data-idx="${i}">
                <div class="song-select-zone" style="display:flex; align-items:center; flex:1; cursor:pointer;">
                    <img src="${s.cover}" class="mini-art">
                    <div class="song-info-texts"><strong>${s.title}</strong><p>${s.artist}</p></div>
                </div>
                <div class="list-heart-btn"><i class="fa-regular fa-heart"></i></div>
            </li>`);
        });
        syncHearts();
    }
    $(document).on('click', '.song-select-zone', function() { load($(this).closest('li').data('idx'), true); $('#sheet').removeClass('expanded'); });
    $(document).on('click', '.list-heart-btn', function(e) { e.stopPropagation(); toggleFav(playlistData[$(this).closest('li').data('idx')].title); });

    // [개선] 가사 실시간 강조 및 스크롤 로직 분리
    function updateLyricsUI(currentTime) {
        if (!currentLyrics || currentLyrics.length === 0) return;
        
        let activeIdx = -1;
        for (let i = 0; i < currentLyrics.length; i++) {
            if (currentTime >= currentLyrics[i].time) {
                activeIdx = i;
            } else break;
        }

        if (activeIdx !== -1) {
            $('.lyric-line').removeClass('active');
            const $activeLine = $(`#lyric-${activeIdx}`).addClass('active');
            
            // 앨범 섹션 내부 컨테이너 기준 정밀 스크롤
            const container = $('.lyrics-container')[0];
            if (container && $activeLine[0]) {
                const lineOffset = $activeLine[0].offsetTop;
                const lineSize = $activeLine[0].offsetHeight;
                const containerSize = container.offsetHeight;
                const scrollTarget = lineOffset - (containerSize / 2) + (lineSize / 2);
                
                container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }
        }
    }

    audio.ontimeupdate = () => {
        if(isNaN(audio.duration)) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100);
        const fmt = s => { const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; };
        $('#time-now').text(fmt(audio.currentTime)); $('#time-total').text(fmt(audio.duration));

        // 가사 모드일 때만 실시간 UI 업데이트
        if ($('#album-trigger').hasClass('show-lyrics')) {
            updateLyricsUI(audio.currentTime);
        }
    };
    $('#progress-bar').on('input', function() { audio.currentTime = ($(this).val()/100)*audio.duration; });

    // [추가] 구글 드라이브 업로드 로직
    $('#btn-do-upload').click(async function() {
        const audioFile = $('#upload-audio')[0].files[0];
        const imageFile = $('#upload-image')[0].files[0];
        const lrcFile = $('#upload-lyrics')[0].files[0];

        if (!audioFile || !imageFile) { alert("음원과 이미지는 필수입니다."); return; }

        const $status = $('#upload-status').text("파일 처리 중...");
        $(this).prop('disabled', true);

        try {
            const toBase64 = file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
            });

            const payload = {
                audioName: audioFile.name,
                audioMime: audioFile.type,
                audioData: await toBase64(audioFile),
                imageName: imageFile.name,
                imageMime: imageFile.type,
                imageData: await toBase64(imageFile)
            };

            // 가사 파일이 있으면 포함 (GAS doPost 수정 필요할 수 있음)
            if (lrcFile) {
                payload.lrcName = lrcFile.name;
                payload.lrcData = await toBase64(lrcFile);
            }

            $status.text("업로드 중... (잠시만 기다려주세요)");
            
            const response = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            $status.text("업로드 성공! 목록을 갱신합니다.");
            setTimeout(() => {
                $('#upload-overlay').removeClass('active');
                fetchPlaylist(); // 목록 새로고침
                $(this).prop('disabled', false);
            }, 2000);
        } catch (e) {
            console.error("Upload Error:", e);
            $status.text("업로드 실패. 다시 시도해주세요.");
            $(this).prop('disabled', false);
        }
    });

    // 초기 실행
    fetchPlaylist();
});