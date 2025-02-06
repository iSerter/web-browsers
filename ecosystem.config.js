module.exports = {
    apps: [
      {
        name: 'api-server',
        script: 'npm',
        args: 'run start',
        instances: 1,
        watch: true,
      },
      {
        name: 'queue-workers',
        script: 'npm',
        args: 'run start:workers',
        instances: 1,
        watch: true,
      },
    ],
  };