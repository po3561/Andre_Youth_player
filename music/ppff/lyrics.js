/**
 * [lyrics.js] 
 * 1. 실시간 가사 동기화 (메인 한 줄 & 확장창 전체)
 * 2. 정보창 상향 확장 모션 제어
 * 3. 가사 클릭 시 음원 구간 점프 기능
 */

// 1. 가사 데이터베이스 (곡 제목별 시간/가사 데이터)
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
    "어둔 날 다 지나고": [], 
    "우리가 주를 더욱 사랑하고": [], 
    "전능하신 나의 주 하나님은": []
};

// 2. 가사 렌더링 함수 (확장창 내부에 전체 가사 생성)
function renderFullLyricsHTML(title) {
    const $container = $('#lyrics-scroll-area');
    $container.empty();
    
    const lyrics = LYRICS_DB[title] || [];
    
    if (lyrics.length === 0) {
        $container.append('<p class="lyric-line no-data">가사가 준비 중입니다. ✨</p>');
        return;
    }

    // 가사 리스트 생성
    lyrics.forEach((line, index) => {
        $container.append(`<p class="lyric-line" data-time="${line.time}" data-idx="${index}">${line.text}</p>`);
    });
}

// 3. 실시간 싱크 함수 (script.js의 ontimeupdate에서 매초 호출됨)
function syncLyrics(currentTime) {
    const title = $('#disp-title').text();
    const lyrics = LYRICS_DB[title] || [];
    let activeIdx = -1;

    // 현재 재생 시간에 맞는 가사 인덱스 찾기
    for (let i = 0; i < lyrics.length; i++) {
        if (currentTime >= lyrics[i].time) {
            activeIdx = i;
        } else {
            break;
        }
    }

    // A. [메인 화면] 정보창 하단에 현재 가사 한 줄 노출
    if (activeIdx !== -1) {
        $('#disp-artist').text(lyrics[activeIdx].text).css('color', 'var(--primary)'); 
    } else {
        // 곡 시작 전이나 가사가 없을 때 기본 문구
        $('#disp-artist').text("우리가 늘 모이던 곳 6층").css('color', 'rgba(255,255,255,0.7)');
    }

    // B. [확장 모드] 가사 하이라이트 및 자동 스크롤
    if ($('#expanding-lyrics-zone').hasClass('active')) {
        const $allLines = $('.lyric-line');
        
        // 클래스 중복 제거 및 현재 가사 강조
        $allLines.removeClass('active');
        if (activeIdx !== -1) {
            const $target = $allLines.eq(activeIdx);
            $target.addClass('active');
            
            // 현재 가사가 가사창의 중앙으로 오도록 부드럽게 스크롤
            const container = document.getElementById('lyrics-scroll-area').parentElement;
            if ($target[0]) {
                $target[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}

// 4. 제이쿼리 이벤트 핸들러
$(document).ready(function() {
    const clickEvent = ('ontouchstart' in window) ? 'touchstart' : 'click';

    // 가사창(정보창) 클릭 시 확장/축소 토글
    $('#expanding-lyrics-zone').on(clickEvent, function(e) {
        // 하트(찜) 버튼 클릭 시에는 확장되지 않도록 방지
        if ($(e.target).closest('.heart-btn').length) return;

        // 확장 안 된 상태면 열기
        if (!$(this).hasClass('active')) {
            renderFullLyricsHTML($('#disp-title').text());
            $(this).addClass('active');
            
            // 열리자마자 즉시 가사 위치 동기화
            const audio = document.getElementById('audio-engine');
            if (audio) syncLyrics(audio.currentTime);
        } 
        // 이미 열린 상태에서 가사가 아닌 배경/핸들을 누르면 닫기
        else {
            if (!$(e.target).hasClass('lyric-line')) {
                $(this).removeClass('active');
            }
        }
    });

    // 확장된 가사 줄 클릭 시 해당 시간대로 음원 점프
    $(document).on(clickEvent, '.lyric-line', function(e) {
        // 배경 클릭 이벤트(닫기)가 발생하지 않도록 전파 차단
        e.stopPropagation(); 
        
        const jumpTime = $(this).data('time');
        const audio = document.getElementById('audio-engine');