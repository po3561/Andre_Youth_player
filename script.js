$(document).ready(function() {
    // 1. 주요 변수 및 요소 캐싱 (최적화)
    const audio = document.getElementById('audio-engine');
    const $progressBar = $('#progress-bar');
    const $timeNow = $('#time-now');
    const $timeTotal = $('#time-total');
    const $albumImg = $('#album-img');
    const $bgImage = $('#bg-image');
    
    let curIdx = -1;
    let isShuffle = false;
    let repeatMode = 0; // 0: None, 1: All, 2: One
    let isDragging = false; // 타임라인 드래그 상태 확인
    let unreadCount = 0;
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];

    // 2. 플레이리스트 데이터
    const playlistData = [
        { title: "광야를 지나며", artist: "Busan Youth Praise", url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: "Busan Youth Praise", url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: "Busan Youth Praise", url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: "Busan Youth Praise", url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: "Busan Youth Praise", url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: "Busan Youth Praise", url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
    ];

    // 3. 곡 로드 함수
    function load(i, forcePlay = false) {
        if (curIdx === i && !forcePlay) return;
        curIdx = i;
        const song = playlistData[i];

        // 오디오 소스 변경 (중복 로드 방지)
        const encodedUrl = encodeURI(song.url); // URL 인코딩 안전장치
        if (audio.src.indexOf(encodedUrl) === -1 && audio.src !== song.url) {
            audio.src = song.url;
            audio.load();
        }

        // UI 업데이트
        $albumImg.attr('src', song.cover);
        $bgImage.css('background-image', `url('${song.cover}')`);
        $('#disp-title').text(song.title);
        $('#disp-artist').text(song.artist);
        updateScrapUI();
        render();

        if (forcePlay) {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => console.log("Auto-play prevented"));
            }
        }
    }

    window.playSong = (i) => { load(i, true); };

    // 4. 타임라인(재생바) 로직 최적화
    audio.ontimeupdate = () => {
        // 드래그 중이거나 duration이 유효하지 않으면 업데이트 안 함
        if (isDragging || isNaN(audio.duration) || audio.duration === 0) return;
        
        const per = (audio.currentTime / audio.duration) * 100;
        $progressBar.val(per);
        $timeNow.text(fmt(audio.currentTime));
        $timeTotal.text(fmt(audio.duration));
    };

    // 드래그 시작
    $progressBar.on('mousedown touchstart', () => { isDragging = true; });

    // 드래그 중 (시간 텍스트만 변경)
    $progressBar.on('input', function() {
        if (isNaN(audio.duration)) return;
        const seekTime = ($(this).val() / 100) * audio.duration;
        $timeNow.text(fmt(seekTime));
    });

    // 드래그 종료 (실제 오디오 이동)
    $progressBar.on('change', function() {
        if (isNaN(audio.duration)) return;
        audio.currentTime = ($(this).val() / 100) * audio.duration;
        isDragging = false;
    });

    // 5. 버튼 이벤트 핸들러
    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    
    // Play/Pause 아이콘 상태 동기화
    audio.onplay = () => $('#btn-play-pause').html('<i class="fas fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fas fa-play"></i>');

    // 셔플
    $('#btn-shuffle').click(function() { 
        isShuffle = !isShuffle; 
        $(this).toggleClass('active', isShuffle); 
    });

    // 반복 (0 -> 1 -> 2 -> 0)
    $('#btn-repeat').click(function() {
        repeatMode = (repeatMode + 1) % 3;
        const $badge = $(this).find('.repeat-badge');
        const $icon = $(this).find('i');
        
        if (repeatMode === 0) {
            $(this).removeClass('active');
            $icon.attr('class', 'fas fa-redo');
            $badge.text('');
        } else if (repeatMode === 1) {
            $(this).addClass('active');
            $icon.attr('class', 'fas fa-redo');
            $badge.text('All');
        } else {
            $(this).addClass('active');
            $icon.attr('class', 'fas fa-redo-alt');
            $badge.text('1');
        }
    });

    // 곡이 끝났을 때
    audio.onended = () => {
        if (repeatMode === 2) {
            audio.currentTime = 0; audio.play();
        } else {
            nextTrack();
        }
    };

    function nextTrack() {
        let n;
        if (isShuffle) {
            n = Math.floor(Math.random() * playlistData.length);
            if (n === curIdx && playlistData.length > 1) n = (n + 1) % playlistData.length;
        } else {
            n = (curIdx + 1) % playlistData.length;
            if (repeatMode === 0 && curIdx === playlistData.length - 1) return;
        }
        playSong(n);
    }

    $('#btn-next').click(nextTrack);
    $('#btn-prev').click(() => playSong((curIdx - 1 + playlistData.length) % playlistData.length, true));

    // 6. 채팅창 제어 (Flex 강제 및 트랜지션)
    $('#btn-open-chat').click(function() {
        $('#chat-overlay').css('display', 'flex').hide().fadeIn(200).addClass('active');
        unreadCount = 0; updateBadge();
    });

    $('#btn-close-chat, #chat-overlay').click(function(e) {
        if (e.target !== this && e.target.id !== 'btn-close-chat' && $(e.target).parents('#btn-close-chat').length === 0) return;
        $('#chat-overlay').removeClass('active').fadeOut(300);
    });

    function updateBadge() {
        if (unreadCount > 0) $('#chat-badge').text(unreadCount > 999 ? '999+' : unreadCount).show();
        else $('#chat-badge').hide();
    }

    function sendMsg() { 
        const m = $('#chat-input').val().trim();
        if (m) { 
            $('#chat-messages').append(`<div class="message me">${m}</div>`); 
            $('#chat-input').val('').focus(); 
            $('.chat-box-content').scrollTop($('.chat-box-content')[0].scrollHeight); 
        } 
    }
    $('#btn-send-chat').click(sendMsg);
    $('#chat-input').keypress(e => { if(e.which==13) sendMsg(); });

    // 7. 기타 기능 (공유, 스크랩, 볼륨)
    $('#btn-share').click(function() {
        const text = `[${playlistData[curIdx].title}] 함께 들어요! 🕊️`;
        if (navigator.share) navigator.share({title:'Heavenly Melody', text:text, url:window.location.href});
        else navigator.clipboard.writeText(window.location.href).then(()=>alert("링크 복사 완료!"));
    });

    $('#btn-scrap').click(function() {
        const t = playlistData[curIdx].title;
        const idx = scrappedSongs.indexOf(t);
        if (idx === -1) scrappedSongs.push(t); else scrappedSongs.splice(idx, 1);
        localStorage.setItem('myScraps', JSON.stringify(scrappedSongs));
        updateScrapUI(); render();
    });

    function updateScrapUI() {
        const has = scrappedSongs.includes(playlistData[curIdx].title);
        $('#btn-scrap').toggleClass('active', has).find('i').attr('class', has ? 'fas fa-heart' : 'far fa-heart');
    }

    $('#trigger').on('click', () => $('#sheet').toggleClass('expanded'));
    $('#volume-bar').on('input', function() { audio.volume = $(this).val() / 100; });
    
    // 시간 포맷팅
    function fmt(s) { 
        if(isNaN(s) || s < 0) return "0:00"; 
        const m = Math.floor(s / 60); 
        const sc = Math.floor(s % 60); 
        return `${m}:${sc < 10 ? '0' + sc : sc}`; 
    }
    
    // 리스트 렌더링
    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            const hColor = scrappedSongs.includes(s.title) ? '#ff4d4d' : '#ccc'; // [수정] 빨간 하트 적용
            $ul.append(`<li class="${i===curIdx?'active':''}" onclick="playSong(${i})">
                <img src="${s.cover}" class="mini-cover">
                <div style="flex:1; text-align:left; min-width:0;">
                    <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.title}</strong>
                    <p style="font-size:0.75rem; color:#888;">${s.artist}</p>
                </div>
                <i class="fas fa-heart" style="color:${hColor}; margin-left: 10px;"></i></li>`);
        });
    }

    // 초기 실행
    load(0);
});