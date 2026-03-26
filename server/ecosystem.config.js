module.exports = {
  apps: [{
    name: 'flowify-api',
    script: 'dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 5073
    }
  }]
};
