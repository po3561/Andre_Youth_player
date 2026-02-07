$(document).ready(function() {
    const firebaseConfig = {
        apiKey: "AIzaSyDt1XdEfx760ojnETRw-HYqJQOP8GK5fXE",
        authDomain: "busan-youth-player.firebaseapp.com",
        databaseURL: "https://busan-youth-player-default-rtdb.firebaseio.com",
        projectId: "busan-youth-player",
        storageBucket: "busan-youth-player.firebasestorage.app",
        messagingSenderId: "406016035492",
        appId: "1:406016035492:web:e3d03145aefa945c707431",
        measurementId: "G-D81R7GBNG6"
    };

    if (typeof firebase !== 'undefined' && !firebase.apps.length) firebase.initializeApp(firebaseConfig);

    const audio = document.getElementById('audio-engine');
    let curIdx = -1;
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatUserId', userId);
    let isShuffle = false;
    let repeatMode = 0; 

    const playlistData = [
        { title: "광야를 지나며", artist: "Busan Youth Praise", url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: "Busan Youth Praise", url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: "Busan Youth Praise", url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: "Busan Youth Praise", url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: "Busan Youth Praise", url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: "Busan Youth Praise", url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
    ];

    function escapeHtml(t) { return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

    // [기능] 미디어 세션 (휴대폰 연동)
    function updateMediaSession() {
        if ('mediaSession' in navigator) {
            const s = playlistData[curIdx];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: s.title, artist: s.artist, artwork: [{ src: s.cover, sizes: '512x512', type: 'image/jpeg' }]
            });
            navigator.mediaSession.setActionHandler('play', () => audio.play());
            navigator.mediaSession.setActionHandler('pause', () => audio.pause());
            navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
            navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        }
    }

    // [기능] 실시간 채팅
    if (typeof firebase !== 'undefined') {
        const db = firebase.database().ref('messages');
        db.on('child_added', (snap) => {
            const m = snap.val();
            if (Date.now() - m.timestamp > 259200000) return;
            const isMe = m.sender === userId;
            $('#chat-messages').append(`<div class="message ${isMe?'me':'other'}">${escapeHtml(m.text).replace(/\n/g,'<br>')}</div>`);
            $('.chat-viewport').scrollTop($('.chat-viewport')[0].scrollHeight);
            if (!$('#chat-overlay').hasClass('active')) {
                $('#chat-badge').text((parseInt($('#chat-badge').text()) || 0) + 1).show();
            }
        });
        const now = new Date();
        const lastAuto = localStorage.getItem('lastAutoDate');
        if (lastAuto !== now.toDateString() && now.getHours() >= 7 && now.getMinutes() >= 30) {
            db.push({ text: "오늘 하루도 기도로 시작해요 🙏", sender: "system", timestamp: Date.now() });
            localStorage.setItem('lastAutoDate', now.toDateString());
        }
    }

    // [모션] 팝업 열기/닫기
    $('#btn-open-chat').click(() => { $('#chat-overlay').addClass('active'); $('#chat-badge').hide().text('0'); });
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
    $('.close-x, .ios-popup').click(function(e) {
        if (e.target === this || $(e.target).closest('.close-x').length > 0) $(this).closest('.ios-popup').removeClass('active');
    });

    // [기능] 하트 연동
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

    // [기능] 플레이어 엔진
    function load(i, play = false) {
        curIdx = i; const s = playlistData[i];
        audio.src = s.url; $('#album-img').attr('src', s.cover);
        $('#bg-image').css('background-image', `url('${s.cover}')`);
        $('#disp-title').text(s.title); $('#disp-artist').text(s.artist);
        render(); syncHearts(); updateMediaSession();
        if (play) audio.play();
    }

    function nextTrack() { load((curIdx + 1) % playlistData.length, true); }
    function prevTrack() { load((curIdx - 1 + playlistData.length) % playlistData.length, true); }

    audio.onended = () => { if (repeatMode === 2) { audio.currentTime = 0; audio.play(); } else nextTrack(); };
    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
    $('#btn-next').click(nextTrack);
    $('#btn-prev').click(prevTrack);

    $('#btn-shuffle').click(function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle); });
    $('#btn-repeat').click(function() {
        repeatMode = (repeatMode + 1) % 3;
        const $dot = $(this).find('.repeat-dot');
        if (repeatMode === 0) { $(this).removeClass('active'); $dot.hide(); }
        else { $(this).addClass('active'); $dot.show(); }
    });

    $('#btn-send-chat').click(() => {
        const t = $('#chat-input').val().trim();
        if(t) { firebase.database().ref('messages').push({text:t, sender:userId, timestamp:Date.now()}); $('#chat-input').val('').focus(); }
    });

    $(document).on('click', '.list-heart-btn', function(e) { e.stopPropagation(); toggleFav(playlistData[$(this).closest('li').index()].title); });
    $('#btn-scrap').click(() => toggleFav(playlistData[curIdx].title));

    // 바텀시트
    let startY = 0;
    $('#sheet-trigger').on('click', () => $('#sheet').toggleClass('expanded'));
    $('#sheet-trigger').on('touchstart', e => { startY = e.originalEvent.touches[0].clientY; });
    $('#sheet-trigger').on('touchend', e => {
        const dist = startY - e.originalEvent.changedTouches[0].clientY;
        if (dist > 35) $('#sheet').addClass('expanded'); else if (dist < -35) $('#sheet').removeClass('expanded');
    });

    // [수정] 시간 포맷 에러 박멸
    function fmt(s) { 
        if(isNaN(s) || !isFinite(s)) return "0:00"; 
        const m = Math.floor(s / 60); 
        const sc = Math.floor(s % 60); 
        return `${m}:${sc < 10 ? '0' + sc : sc}`; 
    }
    
    audio.ontimeupdate = () => { 
        if(isNaN(audio.duration)) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100); 
        $('#time-now').text(fmt(audio.currentTime)); 
        $('#time-total').text(fmt(audio.duration)); 
    };
    $('#progress-bar').on('change', function() { audio.currentTime = ($(this).val()/100)*audio.duration; });
    $('#volume-bar').on('input', function() { audio.volume = $(this).val() / 100; });

    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            $ul.append(`<li class="${i===curIdx?'active':''}" onclick="playSong(${i})">
                <img src="${s.cover}" class="mini-art">
                <div style="flex:1; text-align:left;"><strong>${s.title}</strong><p style="font-size:0.8rem; color:var(--sub);">${s.artist}</p></div>
                <div class="list-heart-btn"><i class="fa-regular fa-heart"></i></div>
            </li>`);
        });
        syncHearts();
    }
    load(0);
});