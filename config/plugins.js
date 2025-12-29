module.exports = ({ env }) => {
  const defaultToProduction = env('NODE_ENV') === 'production'
  const useAwsUploads = env.bool('USE_AWS_UPLOADS', defaultToProduction)

  const uploadConfig = useAwsUploads
    ? {
        provider: 'aws-s3',
        providerOptions: {
          basePath: env('AWS_BASE_PATH', 'uploads'),
          s3Options: {
            credentials: {
              accessKeyId: env('AWS_ACCESS_KEY_ID'),
              secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
            },
            region: env('AWS_REGION'),
            params: {
              Bucket: env('AWS_BUCKET_NAME'),
            },
          },
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      }
    : {
        provider: 'local',
        providerOptions: {
          sizeLimit: env.int('LOCAL_UPLOADS_LIMIT', 25 * 1024 * 1024),
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      }

  return {
    upload: {
      config: uploadConfig,
    },
  }
}
