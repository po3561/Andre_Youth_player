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
    const db = firebase.database();

    const audio = document.getElementById('audio-engine');
    let curIdx = -1;
    let scrappedSongs = JSON.parse(localStorage.getItem('myScraps')) || [];
    let userId = localStorage.getItem('chatUserId') || 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatUserId', userId);
    let myLikedMsgs = JSON.parse(localStorage.getItem('myLikedMsgs')) || [];
    
    let isShuffle = false;
    let repeatMode = 0; // 0:Off, 1:All, 2:One

    const artistText = "2월26일 21시 기도회";
    const playlistData = [
        { title: "광야를 지나며", artist: artistText, url: "music/pyi/광야를 지나며.mp3", cover: "music/jpg/광야를 지나며.jpg" },
        { title: "슬픈 마음 있는 사람", artist: artistText, url: "music/pyi/슬픈 마음 있는 사람.mp3", cover: "music/jpg/슬픈마음있는 사람.jpg" },
        { title: "약할 때 강함 되시네", artist: artistText, url: "music/pyi/약할 때 강함 되시네.mp3", cover: "music/jpg/약할 때 강함 되시네.jpg" },
        { title: "어둔날 다 지나고", artist: artistText, url: "music/pyi/어둔날 다 지나고.mp3", cover: "music/jpg/어둔날 다 지나고.jpg" },
        { title: "우리가 주를 더욱 사랑하고", artist: artistText, url: "music/pyi/우리가 주를 더욱 사랑하고.mp3", cover: "music/jpg/우리가 주를 더욱 사랑하고.jpg" },
        { title: "전능하신 나의 주 하나님은", artist: artistText, url: "music/pyi/전능하신 나의 주 하나님은.mp3", cover: "music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg" }
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
        $('#disp-artist').text("늘 모이던 곳 6층");
        render(); syncHearts(); 
        if (play) audio.play();
    }

    function nextTrack() {
        let nextIdx = isShuffle ? Math.floor(Math.random() * playlistData.length) : (curIdx + 1) % playlistData.length;
        if (isShuffle && nextIdx === curIdx) nextIdx = (nextIdx + 1) % playlistData.length;
        load(nextIdx, true);
    }
    
    audio.onended = () => repeatMode === 2 ? load(curIdx, true) : nextTrack();

    $('#btn-shuffle').click(function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle); });
    $('#btn-repeat').click(function() {
        repeatMode = (repeatMode + 1) % 3;
        $(this).toggleClass('active', repeatMode !== 0);
        $(this).find('.repeat-dot').toggle(repeatMode !== 0);
    });

    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => $('#btn-play-pause').html('<i class="fa-solid fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fa-solid fa-play"></i>');
    $('#btn-next').click(nextTrack);
    $('#btn-prev').click(() => load((curIdx - 1 + playlistData.length) % playlistData.length, true));
    $('#btn-scrap').click(() => toggleFav(playlistData[curIdx].title));

    // 팝업 제어
    $('#btn-open-chat').click(() => { $('#chat-overlay').addClass('active'); $('#chat-badge').hide(); });
    $('#btn-copyright').click(() => $('#copyright-overlay').addClass('active'));
    $('.close-x').click(function() { $(this).closest('.ios-popup').removeClass('active'); });
    $('#sheet-trigger').click(() => $('#sheet').toggleClass('expanded'));

    // 리스트 클릭 (영역 분리)
    $(document).on('click', '.song-select-zone', function() {
        load($(this).closest('li').data('idx'), true);
        $('#sheet').removeClass('expanded');
    });
    $(document).on('click', '.list-heart-btn', function(e) {
        e.stopPropagation();
        toggleFav(playlistData[$(this).closest('li').data('idx')].title);
    });

    // 실시간 채팅
    if (typeof firebase !== 'undefined') {
        const chatDb = db.ref('messages');
        $('#btn-send-chat').click(() => {
            const t = $('#chat-input').val().trim();
            if(t) { chatDb.push({text: t, sender: userId, timestamp: Date.now(), likeCount: 0}); $('#chat-input').val(''); }
        });
        chatDb.limitToLast(30).on('child_added', (snap) => {
            const key = snap.key, m = snap.val(), isMe = m.sender === userId, iLikeIt = myLikedMsgs.includes(key);
            $('#chat-messages').append(`<div class="msg-row ${isMe ? 'me' : 'other'}">
                <div class="message ${isMe ? 'me' : 'other'}">${m.text}</div>
                <button class="msg-like-btn ${iLikeIt ? 'liked' : ''}" data-key="${key}">
                    <i class="${iLikeIt ? 'fa-solid' : 'fa-heart'} fa-heart"></i>
                    <span class="like-count">${m.likeCount || ''}</span>
                </button>
            </div>`);
            $('.chat-viewport').scrollTop($('.chat-viewport')[0].scrollHeight);
            if (!$('#chat-overlay').hasClass('active')) $('#chat-badge').show();
        });
        chatDb.on('child_changed', (snap) => { $(`.msg-like-btn[data-key="${snap.key}"] .like-count`).text(snap.val().likeCount || ''); });
        $(document).on('click', '.msg-like-btn', function() {
            const key = $(this).data('key'), isLiked = myLikedMsgs.includes(key);
            chatDb.child(key).transaction(p => { if (p) p.likeCount = (p.likeCount || 0) + (isLiked ? -1 : 1); return p; }, (e, c) => {
                if (c) {
                    if (isLiked) myLikedMsgs = myLikedMsgs.filter(k => k !== key); else myLikedMsgs.push(key);
                    $(this).toggleClass('liked', !isLiked).find('i').attr('class', !isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart');
                    localStorage.setItem('myLikedMsgs', JSON.stringify(myLikedMsgs));
                }
            });
        });
    }

    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            $ul.append(`<li class="${i===curIdx?'active':''}" data-idx="${i}">
                <div class="song-select-zone">
                    <img src="${s.cover}" class="mini-art">
                    <div class="song-info-texts"><strong>${s.title}</strong><p>${s.artist}</p></div>
                </div>
                <div class="list-heart-btn"><i class="fa-regular fa-heart"></i></div>
            </li>`);
        });
        syncHearts();
    }

    audio.ontimeupdate = () => {
        if(isNaN(audio.duration)) return;
        $('#progress-bar').val((audio.currentTime/audio.duration)*100);
        const fmt = s => { const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; };
        $('#time-now').text(fmt(audio.currentTime)); $('#time-total').text(fmt(audio.duration));
    };
    $('#progress-bar').on('input', function() { audio.currentTime = ($(this).val()/100)*audio.duration; });
    $('#volume-bar').on('input', function() { audio.volume = $(this).val() / 100; });
    
    $('#btn-share').click(() => navigator.share ? navigator.share({title:'Youth Player', text:`${playlistData[curIdx].title} 함께 들어요!`, url:window.location.href}) : alert('링크 복사 완료!'));

    load(0);
});