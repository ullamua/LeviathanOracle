import * as http from 'node:http';
import { tracer } from './tracer';

export function startHealthServer(): http.Server | null {
  const port = Number(process.env.PORT || 0);
  if (!port) return null;
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(port, () => tracer.info('HEALTH', `Listening on :${port}`));
  return server;
}
