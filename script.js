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

    const playlistData = [
        { title: "광야를 지나며", artist: "2월26일 21시 기도회", url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: "2월26일 21시 기도회", url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: "2월26일 21시 기도회", url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: "2월26일 21시 기도회", url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: "2월26일 21시 기도회", url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: "2월26일 21시 기도회", url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
    ];

    // [개선] 사운드바 활성화 로직 (클래스명 mode-volume으로 수정)
    let sbTimer;
    function openSb() {
        $('#main-header').addClass('mode-volume');
        clearTimeout(sbTimer);
        sbTimer = setTimeout(() => $('#main-header').removeClass('mode-volume'), 3500);
    }

    // 터치/클릭 간섭 방지 처리
    $('#btn-vol-trigger').on('click touchstart', function(e) {
        e.stopPropagation(); // 스와이프 로직 간섭 차단
        openSb();
    });

    $('#btn-vol-close').on('click touchstart', function(e) {
        e.stopPropagation();
        $('#main-header').removeClass('mode-volume');
    });

    $('#sb-volume-slider').on('input', function() {
        audio.volume = $(this).val() / 100;
        openSb(); // 조작 중엔 타이머 리셋
    });
    
    // [개선] 재생/일시정지 터치 대응
    $('#btn-play-pause').on('click touchstart', function(e) {
        e.preventDefault(); // 더블 클릭 방지 및 즉각 반응
        e.stopPropagation();
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
        curIdx = i; const s = playlistData[i];
        audio.src = s.url; $('#album-img').attr('src', s.cover);
        $('#bg-image').css('background-image', `url('${s.cover}')`);
        $('#disp-title').text(s.title); render(); syncHearts();
        if (play) audio.play();
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

    audio.ontimeupdate = () => {
        if(isNaN(audio.duration)) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100);
        const fmt = s => { const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; };
        $('#time-now').text(fmt(audio.currentTime)); $('#time-total').text(fmt(audio.duration));
    };
    $('#progress-bar').on('input', function() { audio.currentTime = ($(this).val()/100)*audio.duration; });
    load(0);
});