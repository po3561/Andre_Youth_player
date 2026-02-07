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
    let isShuffle = false;
    let repeatMode = 0; 
    let isDragging = false; 
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

    // [보안] XSS 방지 함수
    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // [기능] 채팅 3일 후 숨김 + 매일 아침 7:30 자동 메시지 로직
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    
    function checkAutoMessage() {
        const lastAutoMsg = localStorage.getItem('lastAutoMsgDate');
        const now = new Date();
        const todayStr = now.toDateString();
        
        // 매일 아침 7시 30분 이후에 첫 접속 시 자동 메시지 전송
        if (lastAutoMsg !== todayStr && now.getHours() >= 7 && now.getMinutes() >= 30) {
            if (typeof firebase !== 'undefined') {
                firebase.database().ref('messages').push({
                    text: "함께 기도해주세요 🙏",
                    sender: "system_auto",
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
                localStorage.setItem('lastAutoMsgDate', todayStr);
            }
        }
    }

    if (typeof firebase !== 'undefined') {
        const dbRef = firebase.database().ref('messages');
        dbRef.off(); 
        
        dbRef.on('child_added', (snapshot) => {
            const msg = snapshot.val();
            const now = Date.now();
            
            // 3일 지난 메시지 필터링
            if (now - msg.timestamp > THREE_DAYS_MS) return;

            const isMe = msg.sender === userId;
            const isSystem = msg.sender === "system_auto";
            let msgClass = isMe ? 'me' : 'other';
            if (isSystem) msgClass = 'system';
            
            // 보안 처리된 텍스트 출력 (줄바꿈 포함)
            const safeText = escapeHtml(msg.text).replace(/\n/g, '<br>');

            $('#chat-messages').append(`<div class="message ${msgClass}">${safeText}</div>`);
            
            const scrollArea = document.getElementById('chat-messages');
            scrollArea.scrollTop = scrollArea.scrollHeight;
            
            if (!$('#chat-overlay').hasClass('active')) {
                let count = parseInt($('#chat-badge').text()) || 0;
                $('#chat-badge').text(count + 1).show();
            }
        });

        checkAutoMessage();
    }

    // [기능] 채팅 전송
    function sendMsg() {
        const txt = $('#chat-input').val().trim();
        if (txt && typeof firebase !== 'undefined') {
            firebase.database().ref('messages').push({
                text: txt, 
                sender: userId, 
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            $('#chat-input').val('').focus();
        }
    }
    $('#btn-send-chat').click(sendMsg);
    $('#chat-input').keypress(e => { 
        if(e.which == 13 && !e.shiftKey) { // Enter 키 전송, Shift+Enter는 줄바꿈
            e.preventDefault();
            sendMsg(); 
        }
    });

    // [기능] 닫기 버튼 개선 (이벤트 버블링 방지)
    $('.close-btn').on('click touchend', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).closest('.chat-overlay').removeClass('active').fadeOut(300);
    });
    
    // 배경 클릭 시 닫기
    $('.chat-overlay').on('click', function(e) {
        if (e.target === this) {
            $(this).removeClass('active').fadeOut(300);
        }
    });

    // [기능] 모달 열기
    $('#btn-open-chat').click(() => { $('#chat-overlay').css('display','flex').hide().fadeIn(200).addClass('active'); $('#chat-badge').hide().text('0'); });
    $('#btn-copyright').click(() => { $('#copyright-overlay').css('display','flex').hide().fadeIn(200).addClass('active'); });


    // [기능] 하트 연동 (양방향)
    function updateScrapUI() {
        if (curIdx === -1) return;
        const curTitle = playlistData[curIdx].title;
        const hasScrap = scrappedSongs.includes(curTitle);
        
        $('#btn-scrap').toggleClass('active', hasScrap).find('i').attr('class', hasScrap ? 'fas fa-heart' : 'far fa-heart');

        $('#song-list-ul li').each(function(i) {
            const title = playlistData[i].title;
            const isSet = scrappedSongs.includes(title);
            const $heartIcon = $(this).find('.fa-heart');
            if (isSet) {
                $heartIcon.removeClass('far').addClass('fas active');
            } else {
                $heartIcon.removeClass('fas active').addClass('far');
            }
        });
    }

    function toggleScrap(title) {
        const idx = scrappedSongs.indexOf(title);
        if (idx === -1) scrappedSongs.push(title); else scrappedSongs.splice(idx, 1);
        localStorage.setItem('myScraps', JSON.stringify(scrappedSongs));
        updateScrapUI();
    }

    $('#btn-scrap').click(() => toggleScrap(playlistData[curIdx].title));
    
    // [중요] 리스트 하트 클릭 시 재생되지 않고 하트만 토글
    $(document).on('click', '.fa-heart', function(e) {
        e.stopPropagation();
        const songIdx = $(this).closest('li').index();
        toggleScrap(playlistData[songIdx].title);
    });

    // [기능] 터치/스와이프
    let startY = 0;
    const $sheet = $('#sheet');
    const $touchZone = $('#sheet-touch-zone');
    
    $touchZone.on('click', () => $sheet.toggleClass('expanded'));
    $touchZone.on('touchstart', e => { startY = e.originalEvent.touches[0].clientY; });
    $touchZone.on('touchend', e => {
        const dist = startY - e.originalEvent.changedTouches[0].clientY;
        if (dist > 30) $sheet.addClass('expanded');
        else if (dist < -30) $sheet.removeClass('expanded');
    });

    // 플레이어 엔진
    function load(i, forcePlay = false) {
        if (curIdx === i && !forcePlay) return;
        curIdx = i; const song = playlistData[i];
        if (audio.src.indexOf(encodeURI(song.url)) === -1) { audio.src = song.url; audio.load(); }
        $('#album-img').attr('src', song.cover);
        $('#bg-image').css('background-image', `url('${song.cover}')`);
        $('#disp-title').text(song.title);
        render(); updateScrapUI();
        if (forcePlay) audio.play();
    }
    window.playSong = (i) => { load(i, true); };

    audio.ontimeupdate = () => {
        if (!audio.duration || isDragging) return;
        $('#progress-bar').val((audio.currentTime / audio.duration) * 100);
        $('#time-now').text(fmt(audio.currentTime)); $('#time-total').text(fmt(audio.duration));
    };
    $('#progress-bar').on('mousedown touchstart', () => { isDragging = true; });
    $('#progress-bar').on('input', function() { if(!isNaN(audio.duration)) $('#time-now').text(fmt(($(this).val()/100)*audio.duration)); });
    $('#progress-bar').on('change', function() { if(!isNaN(audio.duration)) audio.currentTime = ($(this).val()/100)*audio.duration; isDragging = false; });

    $('#btn-play-pause').click(() => audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => $('#btn-play-pause').html('<i class="fas fa-pause"></i>');
    audio.onpause = () => $('#btn-play-pause').html('<i class="fas fa-play"></i>');
    $('#btn-shuffle').click(function() { isShuffle = !isShuffle; $(this).toggleClass('active', isShuffle); });
    $('#btn-repeat').click(function() {
        repeatMode = (repeatMode + 1) % 3;
        const $badge = $(this).find('.repeat-badge'); const $icon = $(this).find('i');
        if (repeatMode === 0) { $(this).removeClass('active'); $icon.attr('class','fas fa-redo'); $badge.text(''); }
        else if (repeatMode === 1) { $(this).addClass('active'); $badge.text('All'); }
        else { $icon.attr('class','fas fa-redo-alt'); $badge.text('1'); }
    });

    audio.onended = () => { if(repeatMode===2) { audio.currentTime=0; audio.play(); } else nextTrack(); };
    function nextTrack() {
        let n = isShuffle ? Math.floor(Math.random()*playlistData.length) : (curIdx + 1) % playlistData.length;
        if(repeatMode===0 && !isShuffle && curIdx===playlistData.length-1) return;
        playSong(n, true);
    }
    $('#btn-next').click(nextTrack);
    $('#btn-prev').click(() => playSong((curIdx - 1 + playlistData.length) % playlistData.length, true));
    $('#volume-bar').on('input', function() { audio.volume = $(this).val() / 100; });
    function fmt(s) { if(isNaN(s)||s<0) return "0:00"; const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m}:${sc<10?'0'+sc:sc}`; }
    
    function render() {
        $('#total-count').text(playlistData.length);
        const $ul = $('#song-list-ul').empty();
        playlistData.forEach((s, i) => {
            $ul.append(`<li class="${i===curIdx?'active':''}" onclick="playSong(${i})">
                <img src="${s.cover}" class="mini-cover">
                <div style="flex:1; text-align:left; min-width:0;"><strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.title}</strong><p style="font-size:0.75rem; color:#888;">${s.artist}</p></div>
                <i class="far fa-heart" style="margin-left: 10px; cursor: pointer;"></i></li>`);
        });
        updateScrapUI();
    }
    load(0);
});