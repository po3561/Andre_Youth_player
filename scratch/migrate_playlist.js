
const https = require('https');

const playlist = [
    {
        "id": "song_1",
        "title": "모든 능력과 모든 권세",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=19OfLOqf2m36qAzf_sXY3A11UhFpgJDbZ",
        "cover": "https://drive.google.com/thumbnail?id=161gl4xiSbwop1sG8FzaW14-WuX5HhOpv&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_2",
        "title": "그 사랑",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=1ho9v5JuoP4lvH83WNWKFwV6pqGcRPoxj",
        "cover": "https://drive.google.com/thumbnail?id=1rc4zPHA0Io8NjeT1JVrWCEXjUxoCMs_U&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_3",
        "title": "나의 안에 거하라",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=14SJVRjAss-cU_2sW_yqQSn0dlIySC0qb",
        "cover": "https://drive.google.com/thumbnail?id=1qByc-3Uvvu9PnZLRiWrhv5eZ7FzFwjcY&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_4",
        "title": "보혈을 지나",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=1R2cZuA5obI4laKN4B3C4InpX-JVLZQup",
        "cover": "https://drive.google.com/thumbnail?id=1DhsrP39OO6VkzbHXQddINA1_2B3Tpo9L&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_5",
        "title": "온 세상 창조주",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=1GGdRaM9p4sF9GlgGQu7E2ShgNe4WFsAd",
        "cover": "https://drive.google.com/thumbnail?id=1uAfk4nZozZwaAd_Isg5ehfxczUsGnNmS&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_6",
        "title": "우리가 주를 더욱 사랑하고",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=15VDQI-Vj21J8ab2ohMcKE6KwtMFTIDFc",
        "cover": "https://drive.google.com/thumbnail?id=1uDjrWWiCZnKi6I93elDY_kmwn_IgG4yk&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_7",
        "title": "이 시간 너의 맘속에",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=120p8uigKhjMSCULVqYXIYs9R5ek8RxPc",
        "cover": "https://drive.google.com/thumbnail?id=1OZm5NGXUhPSdEOynISf0gxzjjXY8WMoU&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    },
    {
        "id": "song_8",
        "title": "청년백과",
        "artist": "Andre Youth",
        "url": "https://drive.google.com/uc?export=download&id=1IKsS-R-tNr55BIs0L5XU_Sowz8S6YVfS",
        "cover": "https://drive.google.com/thumbnail?id=13eTlwi6dOsE2nFfH_mXY3A11UhFpgJDbZ&sz=w1000",
        "lyrics": "",
        "syncOffset": 0,
        "syncMinGap": 0.22
    }
];

const data = JSON.stringify(playlist);

const options = {
    hostname: 'busan-youth-player-default-rtdb.firebaseio.com',
    port: 443,
    path: '/users/playlist.json',
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, (res) => {
    console.log('Status Code:', res.statusCode);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
    process.exit(1);
});

req.write(data);
req.end();
