module.exports = (req, res) => {
  try {
    const app = require("../artifacts/api-server/dist/index.cjs");
    const handler = app.default || app;
    return handler(req, res);
  } catch (error) {
    console.error("API Crash:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
