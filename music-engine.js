/**
 * Music Engine for Andre Youth Player
 * 담당: 오디오 재생 제어, 구글 드라이브 주소 정밀 변환, 가사 데이터 추출
 */
const MusicEngine = {
    audio: document.getElementById('audio-engine') || new Audio(),
    lyrics: [],

    init: function() {
        this.audio.id = 'audio-engine';
        this.audio.preload = "auto";
        this.audio.removeAttribute('crossorigin'); // 구글 드라이브 보안 통과용
        if(!document.getElementById('audio-engine')) document.body.appendChild(this.audio);
    },

    // 구글 드라이브 주소를 '재생 가능한 직접 주소'로 강제 변환 (재생 성공의 핵심)
    fixUrl: function(url, type) {
        if (!url || !url.includes('drive.google.com')) return url;
        const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
            const id = idMatch[1];
            // 음원은 uc?export=download가 가장 안정적으로 재생됩니다.
            return type === 'audio' 
                ? `https://docs.google.com/uc?export=download&id=${id}` 
                : `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
        }
        return url;
    },

    // 가사 텍스트 -> 시간 데이터로 변환 (실시간 추적용)
    parseLyrics: function(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const result = [];
        const timeReg = /\[(\d{2}):(\d{2}\.\d{2})\]/;
        lines.forEach(line => {
            const match = timeReg.exec(line);
            if (match) {
                const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                const text = line.replace(timeReg, '').trim();
                if (text) result.push({ time, text });
            }
        });
        this.lyrics = result;
        return result;
    }
};
MusicEngine.init();