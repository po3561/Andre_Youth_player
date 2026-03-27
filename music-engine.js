/**
 * Music Engine for Andre Youth Player
 * 담당: 오디오 재생 제어, 구글 드라이브 주소 정밀 변환, 가력 데이터 추출
 */
const MusicEngine = {
    audio: document.getElementById('audio-engine') || new Audio(),
    lyrics: [],

    init: function() {
        this.audio.id = 'audio-engine';
        this.audio.preload = "auto";
        // 구글 드라이브 보안 통과 및 스트리밍 최적화
        // this.audio.setAttribute('crossorigin', 'anonymous'); 
        if(!document.getElementById('audio-engine')) document.body.appendChild(this.audio);
    },

    /**
     * 구글 드라이브 주소를 '재생 가능한 직접 주소'로 정밀 변환
     * @param {string} url - 구글 드라이브 공유 링크 또는 ID 포함 URL
     * @param {string} type - 'audio' 또는 'image'
     */
    fixUrl: function(url, type) {
        if (!url) return "";
        if (!url.includes('drive.google.com') && !url.includes('docs.google.com')) return url;

        const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
            const id = idMatch[1];
            // 음원은 uc?export=download가 가장 안정적으로 재생되며, 이미지는 thumbnail API 사용
            return type === 'audio' 
                ? `https://docs.google.com/uc?id=${id}&export=download` 
                : `https://lh3.googleusercontent.com/d/${id}`;
        }
        return url;
    },

    // 가사 텍스트 -> 시간 데이터로 변환 (실시간 추적용)
    parseLyrics: function(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const result = [];
        // [mm:ss.xx] 또는 [mm:ss] 형식 모두 지원
        const timeReg = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/;
        
        lines.forEach(line => {
            const match = timeReg.exec(line);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseFloat(match[2]);
                const time = minutes * 60 + seconds;
                const text = line.replace(timeReg, '').trim();
                // 가사가 빈 줄이 아닌 경우만 추가
                if (text) result.push({ time, text });
            }
        });
        
        // 시간순 정렬 (혹시 모를 에러 방지)
        result.sort((a, b) => a.time - b.time);
        this.lyrics = result;
        return result;
    }
};

MusicEngine.init();