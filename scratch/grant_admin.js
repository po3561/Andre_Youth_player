const https = require('https');

const dbUrl = 'https://busan-youth-player-default-rtdb.firebaseio.com/users.json';

https.get(dbUrl, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        const users = JSON.parse(data);
        let targetKey = null;
        for (const key in users) {
            if (users[key] && users[key].id === 'promise') {
                targetKey = key;
                break;
            }
        }
        
        if (targetKey) {
            console.log('Found promise at key:', targetKey);
            const patchData = JSON.stringify({ isAdmin: true, isApproved: true });
            
            const options = {
                hostname: 'busan-youth-player-default-rtdb.firebaseio.com',
                port: 443,
                path: `/users/${targetKey}.json`,
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(patchData)
                }
            };
            
            const req = https.request(options, (patchRes) => {
                let patchResponse = '';
                patchRes.on('data', d => { patchResponse += d; });
                patchRes.on('end', () => {
                    console.log('Update success:', patchResponse);
                });
            });
            
            req.on('error', (e) => {
                console.error('Update error:', e);
            });
            
            req.write(patchData);
            req.end();
        } else {
            console.log('User promise not found.');
        }
    });
}).on('error', (e) => {
    console.error('Fetch error:', e);
});
