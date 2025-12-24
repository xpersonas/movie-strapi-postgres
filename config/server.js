module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('PUBLIC_URL', 'https://api.movie--nuxt-strapi.ddev.site'),
  
  // Add these app keys - using the ones from your .env file
  app: {
    keys: env.array('APP_KEYS', ['VvubxGTBOVGgwswlvv2elQ==', 'NRfl71sv357XnSZ5E3gK8A==', 'bRoxwbj8Fbm3VTEaMnQjug==', 'CtWg2FExXHd+ZPmiaqR+AA==']),
  },
  
  admin: {
    auth: {
      secret: env('ADMIN_JWT_SECRET', 'tempsecret'),
    },
    watchIgnoreFiles: [
      './public/uploads/**',
    ],
    // Disable HMR to prevent the WebSocket connection issues
    watchAdmin: false,
    // Vite configuration (only needed if you re-enable HMR)
    vite: {
      server: {
        hmr: {
          protocol: 'wss',
          host: 'api.movie--nuxt-strapi.ddev.site',
          port: 5173,
          clientPort: 5173
        },
        host: '0.0.0.0',
        port: 5173,
      }
    },
  },
});