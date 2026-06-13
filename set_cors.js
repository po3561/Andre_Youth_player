const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    endpoint: new AWS.Endpoint('https://81f630d262df1be917412e3888adb133.r2.cloudflarestorage.com'),
    accessKeyId: 'ebae683f2e3a32547e79bcb1814fde7a',
    secretAccessKey: '1c515d389757f8fa3db279b2b6fa96da216cba45e151bca75a03bfb1184d21b5',
    signatureVersion: 'v4',
    region: 'auto'
});

const params = {
    Bucket: 'ply999',
    CORSConfiguration: {
        CORSRules: [
            {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag']
            }
        ]
    }
};

s3.putBucketCors(params, function(err, data) {
    if (err) console.log('CORS Error:', err, err.stack);
    else     console.log('CORS Success:', data);
});
