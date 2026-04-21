export default async function handler(req, res) {
  const { default: app } = await import("../artifacts/api-server/src/app");
  return app(req, res);
}
