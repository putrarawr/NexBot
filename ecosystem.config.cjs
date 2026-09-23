module.exports = {
  apps: [
    {
      name: 'bot-wa',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '320M',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
