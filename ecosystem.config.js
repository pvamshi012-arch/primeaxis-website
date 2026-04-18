module.exports = {
  apps: [{
    name: 'primeaxis',
    script: './server/app.js',
    cwd: __dirname,
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Restart if memory exceeds 300MB
    max_memory_restart: '300M',
    // Auto-restart on crash
    autorestart: true,
    // Watch for file changes (disable in prod if not needed)
    watch: false,
    // Log settings
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true
  }]
};
