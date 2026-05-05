/**
 * Music Engine for Andre Youth Player
 * Shared helpers for audio playback and Google Drive URL normalization.
 */
const PLACEHOLDER_IMAGE =
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
            <defs>
                <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stop-color="#21ccf9"/>
                    <stop offset="100%" stop-color="#0b1220"/>
                </linearGradient>
            </defs>
            <rect width="400" height="400" rx="64" fill="url(#g)"/>
            <circle cx="200" cy="160" r="62" fill="rgba(255,255,255,0.18)"/>
            <path d="M96 304c18-52 58-78 104-78s86 26 104 78" fill="rgba(255,255,255,0.18)"/>
            <circle cx="200" cy="160" r="28" fill="rgba(255,255,255,0.7)"/>
        </svg>`
    );

const MusicEngine = {
    audio: document.getElementById('audio-engine') || new Audio(),
    lyrics: [],
    placeholderImage: PLACEHOLDER_IMAGE,

    init() {
        this.audio.id = 'audio-engine';
        this.audio.preload = 'metadata';
        if (!document.getElementById('audio-engine')) {
            document.body.appendChild(this.audio);
        }
    },

    /**
     * Google Drive URL을 재생/표시 가능한 직접 URL로 변환합니다.
     */
    fixUrl(url, type) {
        if (!url) return type === 'image' ? this.placeholderImage : '';
        if (url.startsWith('data:')) return url;
        if (url.includes('drive.google.com/thumbnail')) return url;
        if (!url.includes('drive.google.com') && !url.includes('docs.google.com')) return url;

        const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!idMatch || !idMatch[1]) return url;

        const id = idMatch[1];
        if (type === 'audio') {
            // No proxy needed for simple audio tag streaming
            return `https://drive.google.com/uc?id=${id}&export=download`;
        }
        return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    },

    parseLyrics(lrcText, offsetSec = 0) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const result = [];
        const timeReg = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/;

        lines.forEach(line => {
            const match = timeReg.exec(line);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseFloat(match[2]);
                const time = Math.max(0, minutes * 60 + seconds + (Number.isFinite(offsetSec) ? offsetSec : 0));
                const text = line.replace(timeReg, '').trim();
                if (text) result.push({ time, text });
            } else {
                const text = line.trim();
                if (text && !line.startsWith('[')) {
                    result.push({ time: 0, text });
                }
            }
        });

        result.sort((a, b) => a.time - b.time);
        this.lyrics = result;
        return result;
    }
};

MusicEngine.init();
