const app = require("../artifacts/api-server/dist/index.cjs");
module.exports = app.default || app;
