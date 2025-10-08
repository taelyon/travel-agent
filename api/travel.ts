import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTravelAction } from '../server/travelService.js';

// Helper to pipe the stream
async function pipeStream(stream: AsyncGenerator<any>, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200);
  try {
    for await (const chunk of stream) {
      // Assuming chunk has a .text() method that returns a string
      const text = chunk.text();
      if (text) {
        res.write(text);
      }
    }
  } catch (error) {
    console.error('Error while streaming data:', error);
    // Don't write further to the response, just log it.
  } finally {
    res.end();
  }
}

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

  const { action, payload, stream } = req.body ?? {};
  const result = await handleTravelAction(action, payload, stream);

  if (result.stream && result.body) {
    await pipeStream(result.body, res);
  } else {
    res.status(result.status).json(result.body);
  }
}
