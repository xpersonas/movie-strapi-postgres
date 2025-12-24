module.exports = ({ env }) => ({
  host: '0.0.0.0',
  port: process.env.PORT || 1337,
  url: env('PUBLIC_URL', 'https://movie-backend-strapi.fly.dev'),
  app: {
    keys: env.array('APP_KEYS'),
  },
});