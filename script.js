$(document).ready(function() {
    // 1. Firebase 설정 (원본 유지)
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

    const audio = document.getElementById('audio-engine');
    let curIdx = -1;
    // [중요] 하트 연동 데이터 복구
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId {"path":"/tauri/C/Users/po356/Documents/GitHub/Andre_Youth_player/script.js"}= localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatUserId', userId);
    let repeatMode = 0; 
    

    
    // [중요] 원본 플레이리스트 6곡 복구
    const playlistData = [
        { title: "광야를 지나며", artist: "Busan Youth Praise", url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: "Busan Youth Praise", url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: "Busan Youth Praise", url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: "Busan Youth Praise", url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: "Busan Youth Praise", url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: "Busan Youth Praise", url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
    ];

    // [기능] 하트 연동 핵심 로직
    function syncHearts() {
        const curTitle = playlistData[curIdx]?.title;
        const isFav = scrappedSongs.includes(curTitle);
        // 메인 하트 버튼 상태 업데이트
        $('#btn-scrap').toggleClass('active', isFav).find('i').attr('class', isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        
        // 리스트 내 하트 상태 업데이트
        $('#song-list-ul li').each(function(i) {
            const isSet = scrappedSongs.includes(playlistData[i].title);
            $(this).find('.list-heart-btn').toggleClass('active', isSet).find('i').attr('class', isSet ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
        });
    }

    function toggleFav(title) {
        const idx = scrappedSongs.indexOf(title);
        if (idx === -1) scrappedSongs.push(title); 
        else scrappedSongs.splice(idx, 1);
        localStorage.setItem('myScraps', JSON.stringify(scrappedSongs));
        syncHearts();
    }

    // [기능] 플레이어 로드
    function load(i, play = false) {
        curIdx = i; const s = playlistData[i];
        audio.src = s.url; 
        $('#album-img').attr('src', s.cover);
        $('#bg-image').css('background-image', `url('${s.cover}')`);
        $('#disp-title').text(s.title); 
        $('#disp-artist').text(s.artist);
        render(); syncHearts(); 
        if (play) audio.play();
    }

    // [기능] 공유하기 (Web Share API)
    $('#btn-share').click(function() {
        const s = playlistData[curIdx];
        if (navigator.share) {
            navigator.share({
                title: 'Youth Player 찬양 공유',
                text: `${s.title} - ${s.artist} (함께 들어요!)`,
                url: window.location.href
            }).catch(console.error);
        } else {
            alert('현재 브라우저에서는 공유 기능을 지원하지 않습니다. 링크를 복사해 주세요!');
        }
    });

    // 플레이어 기본 동작
    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
    $('#btn-next').click(() => load((curIdx + 1) % playlistData.length, true));
    $('#btn-prev').click(() => load((curIdx - 1 + playlistData.length) % playlistData.length, true));

    // 하트 클릭 이벤트
    $('#btn-scrap').click(() => toggleFav(playlistData[curIdx].title));
    $(document).on('click', '.list-heart-btn', function(e) {
        e.stopPropagation();
        const idx = $(this).closest('li').data('idx');
        toggleFav(playlistData[idx].title);
    });

    // 팝업 제어
    $('#btn-open-chat').click(() => $('#chat-overlay').addClass('active'));
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
    $('.close-x').click(() => $('.ios-popup').removeClass('active'));
    $('#sheet-trigger').click(() => $('#sheet').toggleClass('expanded'));

    // 채팅 기능 (실시간 연동)
    if (typeof firebase !== 'undefined') {
        const db = firebase.database().ref('messages');
        $('#btn-send-chat').click(() => {
            const t = $('#chat-input').val().trim();
            if(t) { db.push({text:t, sender:userId, timestamp:Date.now()}); $('#chat-input').val(''); }
        });
        db.limitToLast(30).on('child_added', (snap) => {
            const m = snap.val();
            const isMe = m.sender === userId;
            $('#chat-messages').append(`<div class="message ${isMe?'me':'other'}">${m.text}</div>`);
            $('.chat-viewport').scrollTop($('.chat-viewport')[0].scrollHeight);
        });
    }

    // 리스트 렌더링
    window.playSong = (i) => { load(i, true); $('#sheet').removeClass('expanded'); };
    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            $ul.append(`<li class="${i===curIdx?'active':''}" data-idx="${i}" onclick="playSong(${i})">
                <img src="${s.cover}" class="mini-art">
                <div style="flex:1;"><strong>${s.title}</strong><p style="font-size:0.75rem;">${s.artist}</p></div>
                <div class="list-heart-btn"><i class="fa-regular fa-heart"></i></div>
            </li>`);
        });
        syncHearts();
    }

    // 시간 업데이트
    audio.ontimeupdate = () => {
        if(isNaN(audio.duration)) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100);
        const fmt = (s) => { const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; };
        $('#time-now').text(fmt(audio.currentTime));
        $('#time-total').text(fmt(audio.duration));
    };
    $('#progress-bar').on('input', function() { audio.currentTime = ($(this).val()/100)*audio.duration; });

    load(0);
});