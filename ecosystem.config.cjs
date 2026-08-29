module.exports = {
  apps: [
    {
      name: 'ai-email-whatsapp-connect',
      script: 'node',
      args: '--import tsx src/index.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 2000,
      max_restarts: 10,
    },
  ],
};
