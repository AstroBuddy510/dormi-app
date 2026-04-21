import app from "../artifacts/api-server/dist/index.cjs";

export default async function handler(req, res) {
  try {
    const handlerFunc = app.default || app;
    return handlerFunc(req, res);
  } catch (error) {
    console.error("API Crash:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: error.message
    });
  }
}
