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

    const playlistData = [
        { title: "광야를 지나며", artist: "Busan Youth Praise", url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: "Busan Youth Praise", url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: "Busan Youth Praise", url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: "Busan Youth Praise", url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: "Busan Youth Praise", url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: "Busan Youth Praise", url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
    ];

    // [기능 1] 채팅 실시간 수신 및 표시
    if (typeof firebase !== 'undefined') {
        const dbRef = firebase.database().ref('messages');
        dbRef.on('child_added', (snapshot) => {
            const msg = snapshot.val();
            const msgClass = msg.sender === userId ? 'me' : 'other';
            $('#chat-messages').append(`<div class="message ${msgClass}">${msg.text}</div>`);
            $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight);
            if (!$('#chat-overlay').hasClass('active')) $('#chat-badge').text((parseInt($('#chat-badge').text()) || 0) + 1).show();
        });
    }

    window.sendMsg = () => {
        const txt = $('#chat-input').val().trim();
        if (txt) {
            firebase.database().ref('messages').push({ text: txt, sender: userId, timestamp: Date.now() });
            $('#chat-input').val('').focus();
        }
    };
    $('#btn-send-chat').click(sendMsg);
    $('#chat-input').keypress(e => { if(e.which==13) sendMsg(); });

    // [기능 2] 하트(스크랩) 완벽 연동
    function syncHearts() {
        const curTitle = playlistData[curIdx]?.title;
        const isFav = scrappedSongs.includes(curTitle);
        $('#btn-scrap').toggleClass('active', isFav).find('i').attr('class', isFav?'fas fa-heart':'far fa-heart');
        
        $('#song-list-ul li').each(function(i) {
            const isSet = scrappedSongs.includes(playlistData[i].title);
            $(this).find('.fa-heart').attr('class', isSet?'fas fa-heart active':'far fa-heart');
        });
    }

    window.toggleFav = (title) => {
        const idx = scrappedSongs.indexOf(title);
        if (idx === -1) scrappedSongs.push(title); else scrappedSongs.splice(idx, 1);
        localStorage.setItem('myScraps', JSON.stringify(scrappedSongs));
        syncHearts();
    };

    $('#btn-scrap').click(() => toggleFav(playlistData[curIdx].title));
    $(document).on('click', '.fa-heart', function(e) { 
        e.stopPropagation(); 
        toggleFav(playlistData[$(this).closest('li').index()].title); 
    });

    // [기능 3] 터치/스와이프
    let startY = 0;
    $('#sheet-touch-zone').on('click', () => $('#sheet').toggleClass('expanded'));
    $('#sheet-touch-zone').on('touchstart', e => { startY = e.originalEvent.touches[0].clientY; });
    $('#sheet-touch-zone').on('touchend', e => {
        const dist = startY - e.originalEvent.changedTouches[0].clientY;
        if (dist > 30) $('#sheet').addClass('expanded');
        else if (dist < -30) $('#sheet').removeClass('expanded');
    });

    // 플레이어 기본 로직
    function load(i, play = false) {
        curIdx = i; const s = playlistData[i];
        audio.src = s.url;
        $('#album-img').attr('src', s.cover);
        $('#bg-image').css('background-image', `url('${s.cover}')`);
        $('#disp-title').text(s.title);
        render(); syncHearts();
        if (play) audio.play();
    }
    window.playSong = (i) => load(i, true);

    audio.ontimeupdate = () => {
        if (!audio.duration) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100);
        $('#time-now').text(fmt(audio.currentTime)); $('#time-total').text(fmt(audio.duration));
    };

    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => $('#btn-play-pause').html('<i class="fas fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fas fa-play"></i>');
    $('#btn-next').click(() => playSong((curIdx + 1) % playlistData.length, true));
    $('#btn-prev').click(() => playSong((curIdx - 1 + playlistData.length) % playlistData.length, true));
    
    $('#btn-open-chat').click(() => { $('#chat-overlay').fadeIn(200).addClass('active'); $('#chat-badge').hide().text('0'); });
    $('#btn-close-chat, #chat-overlay').click(e => { if(e.target===e.currentTarget || e.target.id==='btn-close-chat') $('#chat-overlay').removeClass('active').fadeOut(300); });
    $('#btn-copyright').click(() => $('#copyright-overlay').fadeIn(200).addClass('active'));
    $('#btn-close-copyright, #copyright-overlay').click(e => { if(e.target===e.currentTarget || e.target.id==='btn-close-copyright') $('#copyright-overlay').removeClass('active').fadeOut(300); });
    
    $('#volume-bar').on('input', function() { audio.volume = $(this).val() / 100; });
    function fmt(s) { if(isNaN(s)) return "0:00"; const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; }
    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            $ul.append(`<li class="${i===curIdx?'active':''}" onclick="playSong(${i})">
                <img src="${s.cover}" class="mini-cover">
                <div style="flex:1; text-align:left;"><strong>${s.title}</strong><p style="font-size:0.75rem; color:#888;">${s.artist}</p></div>
                <i class="far fa-heart" style="margin-left: 10px; cursor: pointer;"></i></li>`);
        });
        syncHearts();
    }
    load(0);
});