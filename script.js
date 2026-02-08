$(document).ready(function() {
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
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatUserId', userId);

    // [핵심] 셔플 및 반복 모드 변수
    let isShuffle = false;
    let repeatMode = 0; // 0: 반복 안함(순차), 1: 전체 반복, 2: 한곡 반복

    const playlistData = [
        { title: "광야를 지나며", artist: "Busan Youth Praise", url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: "Busan Youth Praise", url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: "Busan Youth Praise", url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: "Busan Youth Praise", url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: "Busan Youth Praise", url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: "Busan Youth Praise", url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
    ];

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

    function load(i, play = false) {
        curIdx = i; const s = playlistData[i];
        audio.src = s.url; 
        $('#album-img').attr('src', s.cover);
        $('#bg-image').css('background-image', `url('${s.cover}')`);
        $('#disp-title').text(s.title); 
        $('#disp-artist').text("43.02.26 목 21시 늘 모이던 곳 6층");
        render(); syncHearts(); 
        if (play) audio.play();
    }

    // [핵심] 다음 곡 로직 (셔플/순차 대응)
    function nextTrack() {
        let nextIdx;
        if (isShuffle) {
            nextIdx = Math.floor(Math.random() * playlistData.length);
            if (nextIdx === curIdx) nextIdx = (nextIdx + 1) % playlistData.length;
        } else {
            nextIdx = (curIdx + 1) % playlistData.length;
        }
        load(nextIdx, true);
    }

    function prevTrack() {
        load((curIdx - 1 + playlistData.length) % playlistData.length, true);
    }

    // [핵심] 곡이 끝났을 때 처리
    audio.onended = () => {
        if (repeatMode === 2) {
            load(curIdx, true); // 한곡 반복
        } else {
            nextTrack(); // 다음 곡으로 (셔플 상태면 알아서 섞임)
        }
    };

    // [핵심] 셔플/반복 버튼 이벤트
    $('#btn-shuffle').click(function() {
        isShuffle = !isShuffle;
        $(this).toggleClass('active', isShuffle);
    });

    $('#btn-repeat').click(function() {
        repeatMode = (repeatMode + 1) % 3;
        const $dot = $(this).find('.repeat-dot');
        if (repeatMode === 0) { $(this).removeClass('active'); $dot.hide(); }
        else { $(this).addClass('active'); $dot.show(); }
    });

    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
    $('#btn-next').click(nextTrack);
    $('#btn-prev').click(prevTrack);

    $('#btn-scrap').click(() => toggleFav(playlistData[curIdx].title));
    $(document).on('click', '.list-heart-btn', function(e) {
        e.stopPropagation();
        const idx = $(this).closest('li').data('idx');
        toggleFav(playlistData[idx].title);
    });

    $('#btn-open-chat').click(() => $('#chat-overlay').addClass('active'));
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
    $('.close-x').click(() => $('.ios-popup').removeClass('active'));
    $('#sheet-trigger').click(() => $('#sheet').toggleClass('expanded'));

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

    audio.ontimeupdate = () => {
        if(isNaN(audio.duration)) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100);
        const fmt = (s) => { const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; };
        $('#time-now').text(fmt(audio.currentTime)); $('#time-total').text(fmt(audio.duration));
    };
    $('#progress-bar').on('input', function() { audio.currentTime = ($(this).val()/100)*audio.duration; });
    $('#volume-bar').on('input', function() { audio.volume = $(this).val() / 100; });

    load(0);
});