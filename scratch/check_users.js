const https = require('https');
const dbUrl = 'https://busan-youth-player-default-rtdb.firebaseio.com/users.json';
https.get(dbUrl, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => console.log(data));
});
