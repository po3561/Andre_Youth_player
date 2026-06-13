/**
 * Music Engine for Andre Youth Player (Hyper-Stable Version)
 */
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1514525253361-bee8718a300c?q=80&w=400&auto=format&fit=crop';

const MusicEngine = {
    audio: document.getElementById('audio-engine') || new Audio(),
    placeholderImage: PLACEHOLDER_IMAGE,

    init() {
        this.audio.id = 'audio-engine';
        // Remove crossOrigin to bypass strict CORS requirements for simple playback
        this.audio.removeAttribute('crossorigin');
        if (!document.getElementById('audio-engine')) document.body.appendChild(this.audio);
    },

    fixUrl(url, type) {
        if (!url) return type === 'image' ? this.placeholderImage : '';
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        
        const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!idMatch || !idMatch[1]) return url;
        const id = idMatch[1];

        if (type === 'image') {
            return `https://lh3.googleusercontent.com/d/${id}=w1000`;
        }

        // Return the primary URL, but we'll handle fallbacks in script.js
        return `https://docs.google.com/uc?export=open&id=${id}`;
    },

    getFallbacks(id) {
        const ts = Date.now();
        return [
            `https://lh3.googleusercontent.com/d/${id}?t=${ts}`, // High success rate trick
            `https://docs.google.com/uc?export=download&id=${id}&t=${ts}`,
            `https://drive.google.com/uc?id=${id}&export=download`
        ];
    },

    parseLyrics(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const result = [];
        const timeReg = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/;

        lines.forEach(line => {
            const match = timeReg.exec(line);
            if (match) {
                const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                const text = line.replace(timeReg, '').trim();
                if (text) result.push({ time, text });
            }
        });
        return result.sort((a, b) => a.time - b.time);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MusicEngine.init());
} else {
    MusicEngine.init();
}
