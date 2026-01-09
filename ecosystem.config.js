module.exports = {
  apps: [{
    name: 'forzza-vps',
    script: 'cluster.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      WEB_CONCURRENCY: 4
    },
    max_memory_restart: '2G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
