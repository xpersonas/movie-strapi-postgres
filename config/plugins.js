module.exports = {
    documentation: {
      enabled: true,
      config: {
        openapi: '3.0.0',
        info: {
          version: '1.0.0',
          title: 'Movie API Documentation',
          description: 'Documentation for the Movie API',
          termsOfService: 'YOUR_TERMS_OF_SERVICE_URL',
          contact: {
            name: 'Your team',
            email: 'your-email@example.com',
            url: 'https://your-website.com'
          },
          license: {
            name: 'Apache 2.0',
            url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
          }
        }
      }
    },
    upload: {
      config: {
        provider: 'aws-s3',
        providerOptions: {
          basePath: process.env.AWS_BASE_PATH || 'uploads',
          s3Options: {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
            region: process.env.AWS_REGION,
            params: {
              Bucket: process.env.AWS_BUCKET_NAME,
            },
          },
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      },
    },
  };
