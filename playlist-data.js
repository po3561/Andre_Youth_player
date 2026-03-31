(() => {
    const folderId = '1V1v0NkmtIfVfwRNoGgN6TffdiFTGXh2d';
    const audioFileId = '12t9OSJmw27DOC2QlfqjiZKeu-x4bCUND';
    const imageFileId = '1nv0xIHkzJ0G0CVNXiiFM_feJjWoRNOst';
    const lyricsFileId = '1aSvzRXjcdtZGgi4Q46atmOrUq9W0fdQC';

    const audioUrl = `https://drive.google.com/uc?export=download&id=${audioFileId}`;
    const coverUrl = `https://drive.google.com/thumbnail?id=${imageFileId}&sz=w1000`;

    const lyricsData = `[00:00.30] 오늘 내 눈에 보이지 않고
[00:07.68] 오늘 내 손에 잡히지 않아도
[00:15.07] 그의 눈이 날 지켜보셨고
[00:22.46] 그의 손이 지켜주셨기에
[00:29.84] 오늘 내 눈에 보이지 않고
[00:37.23] 오늘 내 손에 잡히지 않아도
[00:44.62] 그의 눈이 날 지켜보셨고
[00:52.00] 그의 손이 지켜주셨기에
[00:59.39] 예수 그리스도로
[01:06.77] 말미암아 우리에게
[01:14.16] 이김을 주시는
[01:21.55] 하나님께 감사하노니
[01:28.94] 그러므로 사랑하는
[01:36.32] 형제들이 흔들리지 않기를
[01:43.71] 오늘 하루가 주 안에서
[01:51.10] 헛되지 않음을 기억하기를
[01:58.48] 오늘 내 눈에 보이지 않고
[02:05.87] 오늘 내 손에 잡히지 않아도
[02:13.26] 그의 눈이 날 지켜보셨고
[02:20.64] 그의 손이 지켜주셨기에
[02:28.03] 그러므로 사랑하는
[02:35.42] 형제들이 흔들리지 않기를
[02:42.80] 오늘 하루가 주 안에서
[02:50.19] 헛되지 않음을 기억하기를
[02:57.58] 그러므로 사랑하는
[03:04.96] 형제들이 흔들리지 않기를
[03:12.35] 오늘 하루가 주 안에서
[03:19.74] 헛되지 않음을 기억하기를
[03:27.12] 헛되지 않음을 기억하기를
[03:34.51] 헛되지 않음을 기억하기를`;

    window.PUBLIC_PLAYLIST = [
        {
            id: '그러므로',
            title: '그러므로',
            artist: 'Andre Youth',
            sourceFolderId: folderId,
            audioFileId,
            imageFileId,
            lyricsFileId,
            url: audioUrl,
            cover: coverUrl,
            profile: coverUrl,
            lyricsData
        },
        {
            id: '우리가-주를-더욱-사랑하고',
            title: '우리가 주를 더욱 사랑하고',
            artist: 'Andre Youth',
            cover: coverUrl,
            profile: coverUrl
        },
        {
            id: '행복',
            title: '행복',
            artist: 'Andre Youth',
            cover: coverUrl,
            profile: coverUrl
        },
        {
            id: '첫째되는-계명',
            title: '첫째되는 계명',
            artist: 'Andre Youth',
            cover: coverUrl,
            profile: coverUrl
        },
        {
            id: '혼자-걷지-않을-거예요',
            title: '혼자 걷지 않을 거예요',
            artist: 'Andre Youth',
            cover: coverUrl,
            profile: coverUrl
        },
        {
            id: '하나님의-사랑',
            title: '하나님의 사랑',
            artist: 'Andre Youth',
            cover: coverUrl,
            profile: coverUrl
        }
    ];
})();
