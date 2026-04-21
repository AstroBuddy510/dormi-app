import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../artifacts/api-server/dist/index.cjs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
