/* [lyrics.js] 가사 데이터 및 제어 */

// 1. 가사 데이터베이스
const LYRICS_DB = {
    "광야를 지나며": [
        { time: 0, text: "왜 나를 깊은 어둠속에" },
        { time: 6, text: "홀로 두시는지" },
        { time: 12, text: "어두운 밤은 왜 그리 길었는지" },
        { time: 23, text: "나를 고독하게 나를 낮아지게" },
        { time: 34, text: "세상 어디도 기댈 곳이 없게 하셨네" },
        { time: 46, text: "광야 광야에 서 있네" },
        { time: 57, text: "주님만 내 도움이 되시고" },
        { time: 63, text: "주님만 내 빛이 되시는" },
        { time: 69, text: "주님만 내 친구 되시는 광야" },
        { time: 80, text: "주님 손 놓고는 단 하루도" },
        { time: 86, text: "살 수 없는 곳 광야" },
        { time: 95, text: "광야에 서 있네" }
    ],
    "슬픈 마음 있는 사람": [],
    "약할 때 강함 되시네": [],
    "어둔날 다 지나고": [],
    "우리가 주를 더욱 사랑하고": [],
    "전능하신 나의 주 하나님은": []
};

// 2. 가사창 열기 및 렌더링
function renderLyrics(title) {
    const $area = $('#lyrics-scroll-area').empty();
    $('#lyrics-title-text').text(title);
    
    const lyrics = LYRICS_DB[title] || [];
    if (lyrics.length === 0) {
        $area.append('<p class="lyric-line no-data" style="opacity:0.5; text-align:center; margin-top:30vh;">가사가 준비 중입니다.</p>');
    } else {
        $area.append('<div style="height: 30vh;"></div>'); // 상단 여백
        lyrics.forEach(line => {
            $area.append(`<p class="lyric-line" data-time="${line.time}">${line.text}</p>`);
        });
        $area.append('<div style="height: 50vh;"></div>'); // 하단 여백
    }
}

// 3. 실시간 싱크 (하이라이트 & 스크롤)
function syncLyrics(currentTime) {
    if (!$('#lyrics-overlay').hasClass('active')) return;

    const title = $('#disp-title').text();
    const lyrics = LYRICS_DB[title] || [];
    let activeIdx = -1;

    for (let i = 0; i < lyrics.length; i++) {
        if (currentTime >= lyrics[i].time) activeIdx = i;
        else break;
    }

    // 스타일 업데이트 (성능 최적화)
    const $lines = $('.lyric-line');
    $lines.removeClass('active');
    
    if (activeIdx !== -1) {
        const $target = $lines.eq(activeIdx);
        $target.addClass('active');
        // 부드러운 스크롤 (중앙 정렬)
        $target[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// 4. 이벤트 리스너 (터치 대응)
$(document).ready(function() {
    const touchEvent = ('ontouchstart' in window) ? 'touchstart' : 'click';

    // 앨범 아트 터치 -> 가사창 열기
    $('#album-trigger').on(touchEvent, function(e) {
        e.preventDefault(); // 이벤트 중복 방지
        renderLyrics($('#disp-title').text());
        $('#lyrics-overlay').addClass('active');
    });

    // 닫기 버튼
    $('#btn-close-lyrics').on(touchEvent, function(e) {
        e.preventDefault();
        $('#lyrics-overlay').removeClass('active');
    });

    // 가사 줄 터치 -> 해당 시간으로 점프
    $(document).on(touchEvent, '.lyric-line', function() {
        const time = $(this).data('time');
        const audio = document.getElementById('audio-engine');
        if (time !== undefined && audio) {
            audio.currentTime = time;
            if (audio.paused) audio.play();
        }
    });
});