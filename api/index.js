const app = require("./bundle.cjs");

module.exports = (req, res) => {
  try {
    const handler = app.default || app;
    return handler(req, res);
  } catch (error) {
    console.error("API Crash:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: error.message
    });
  }
};
