module.exports = {
  apps: [
    {
      name: 'trx-bot',
      script: 'bot.js',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
