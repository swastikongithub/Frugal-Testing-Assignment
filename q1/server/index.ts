import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { MarketFeed } from './market';
import { OrderStore } from './orders';

const PORT = Number(process.env.PORT ?? 5317);
const HOST = process.env.HOST ?? '127.0.0.1';
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const market = new MarketFeed();
const orders = new OrderStore();
const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, seq: market.head() });
});

/** REST snapshot used by the client to resynchronise after a sequence gap. */
app.get('/api/snapshot', (_req, res) => {
  res.set('Cache-Control', 'no-store').json(market.snapshot());
});

/** Current head sequence, so a test knows how far the client must catch up. */
app.get('/api/head', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ seq: market.head() });
});

/** Server truth at a given seq, so a test can prove the client has zero drift. */
app.get('/api/state/:seq', (req, res) => {
  const state = market.stateAt(Number(req.params.seq));
  if (!state) {
    res.status(404).json({ error: 'SEQ_EVICTED', seq: req.params.seq });
    return;
  }
  res.json(state);
});

/** Transaction endpoint. Raw text body so the store sees the exact bytes the browser sent. */
app.post('/api/orders', express.text({ type: '*/*', limit: '16kb' }), (req, res) => {
  const session = String(req.query.session ?? 'default');
  const rawBody = typeof req.body === 'string' ? req.body : '';
  const result = orders.submit(session, req.get('Idempotency-Key') ?? null, rawBody);
  res.status(result.status).json(result.body);
});

/** Ledger for a session: how many order requests arrived vs. how many orders were recorded. */
app.get('/api/orders', (req, res) => {
  res.set('Cache-Control', 'no-store').json(orders.ledger(String(req.query.session ?? 'default')));
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
} else {
  app.get('/', (_req, res) => {
    res.status(503).send('Client bundle missing: run "npm run build" first.');
  });
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/stream' });

market.onFrame((frame) => {
  const payload = JSON.stringify(frame);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
});

httpServer.listen(PORT, HOST, () => {
  market.start();
  console.log(`[mock-exchange] http://${HOST}:${PORT}  (ws /stream, 10-20 frames/s)`);
});

const shutdown = () => {
  market.stop();
  wss.close();
  httpServer.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
