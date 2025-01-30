const path = require('path');

module.exports = ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', 'db'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'db'),
      user: env('DATABASE_USERNAME', 'db'),
      password: env('DATABASE_PASSWORD', 'db'),
      ssl: env.bool('DATABASE_SSL', false),
    },
  },
});
