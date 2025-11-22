module.exports = {
  apps: [
    {
      name: "tenmiku-prod",
      script: "main.prod.ts",
      interpreter: "bun",
      interpreter_args: "main.prod.ts",
      // max_restarts: 10,
      // restart_delay: 10 * 1000,
      // watch: false,
      ignore_watch: ["node_modules", "dist", "logs", "\\.git", "\\.data", "\\.cache", "*.log", "*.db", "web"],
      cwd: process.cwd(),
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Shanghai",
        FORCE_COLOR: "1",
      },
    },
  ],
};