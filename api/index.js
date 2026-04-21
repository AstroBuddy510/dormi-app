import app from "../artifacts/api-server/dist/index.cjs";

export default function handler(req, res) {
  try {
    return app(req, res);
  } catch (error) {
    console.error("API Crash:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: error.message
    });
  }
}
