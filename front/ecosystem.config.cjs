module.exports = {
  apps: [
    {
      name: "ifc-file-opener",
      script: "npm",
      args: "run start",
      cwd: "C:\\Users\\Lenovo IdeaCentre\\Downloads\\BimSoda-main\\BimSoda-main",
      interpreter: "cmd.exe",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};