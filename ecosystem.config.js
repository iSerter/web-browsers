module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'npm',
      args: 'run start',
      instances: 1,
      watch: false, // disable watch inside container to avoid duplicate restarts / EADDRINUSE
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production'
      }
    
    },
    {
      name: 'queue-workers',
      script: 'npm',
      args: 'run start:workers',
      instances: 1,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'log-cleaner',
      script: 'src/util/cleanup-logs.js',
      env: {
        LOG_CLEAN_INTERVAL_MS: process.env.LOG_CLEAN_INTERVAL_MS || 3600000,
        LOG_CLEAN_STRATEGY: process.env.LOG_CLEAN_STRATEGY || 'delete',
        // LOG_FILES can be provided at runtime
      }
    }
  ]
};