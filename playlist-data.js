(() => {
    const RAW_BASE = 'https://raw.githubusercontent.com/po3561/Andre_Youth_player/ac08006/';
    const raw = path => `${RAW_BASE}${encodeURI(path)}`;
    const genericCover = raw('music/jpg/ddd6ed85331e167a7d9437697300ffbe.jpg');
    const wideCover = raw('music/jpg/광야를 지나며.jpg');
    const loveCover = raw('music/jpg/우리가 주를 더욱 사랑하고.jpg');

    const 광야Lyrics = `[00:00.00]왜 나를 깊은 어둠속에
[00:06.00]홀로 두시는지
[00:12.00]어두운 밤은 왜 그리 길었는지
[00:23.00]나를 고독하게 나를 낮아지게
[00:34.00]세상 어디도 기댈 곳이 없게 하셨네
[00:46.00]광야 광야에 서 있네
[00:57.00]주님만 내 도움이 되시고
[01:03.00]주님만 내 빛이 되시는
[01:09.00]주님만 내 친구 되시는 광야
[01:20.00]주님 손 놓고는 단 하루도
[01:26.00]살 수 없는 곳 광야
[01:35.00]광야에 서 있네`;

    window.PUBLIC_PLAYLIST = [
        {
            title: '혼자 걷지 않을 거예요',
            artist: '예람워십',
            url: raw('music/pyi/혼자 걷지 않을 거예요 - 예람워십.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '우리가 주를 더욱 사랑하고',
            artist: 'Andre Youth',
            url: raw('music/pyi/우리가 주를 더욱 사랑하고.mp3'),
            cover: loveCover,
            lyricsData: ''
        },
        {
            title: '행복',
            artist: '피아워십',
            url: raw('music/pyi/행복 - 피아워십.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '그러므로',
            artist: 'Andre Youth',
            url: raw('music/pyi/그러므로.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '광야를 지나며',
            artist: 'Andre Youth',
            url: raw('music/pyi/광야를 지나며.mp3'),
            cover: wideCover,
            lyricsData: 광야Lyrics
        },
        {
            title: '슬픈 마음 있는 사람',
            artist: 'Andre Youth',
            url: raw('music/pyi/슬픈 마음 있는 사람.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '약할 때 강함 되시네',
            artist: 'Andre Youth',
            url: raw('music/pyi/약할 때 강함 되시네.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '어둔날 다 지나고',
            artist: 'Andre Youth',
            url: raw('music/pyi/어둔날 다 지나고.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '전능하신 나의 주 하나님은',
            artist: 'Andre Youth',
            url: raw('music/pyi/전능하신 나의 주 하나님은.mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '첫째되는 계명',
            artist: 'Andre Youth',
            url: raw('music/pyi/첫째되는 계명 (1).mp3'),
            cover: genericCover,
            lyricsData: ''
        },
        {
            title: '하나님의 사랑이',
            artist: 'Andre Youth',
            url: raw('music/pyi/하나님의 사랑이.mp3'),
            cover: genericCover,
            lyricsData: ''
        }
    ];
})();
