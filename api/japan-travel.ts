import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleJapanTravelAction } from '../server/japanTravelService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { action, payload } = req.body ?? {};
  const result = await handleJapanTravelAction(action, payload);
  res.status(result.status).json(result.body);
}
