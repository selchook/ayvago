// Serves the bridge fixture game on its own origin (default http://localhost:4173), so the
// platform at http://localhost:3000 embeds it cross-origin exactly like a real game.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4173);
const page = await readFile(new URL('./index.html', import.meta.url));

createServer((req, res) => {
  if (req.url !== '/' && !req.url?.startsWith('/?')) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    // Same header the real games get during import: only Ayvago may embed them.
    'Content-Security-Policy': "frame-ancestors 'self' http://localhost:3000 https://ayvago.com",
  });
  res.end(page);
}).listen(port, () => {
  console.log(`Bridge fixture game on http://localhost:${port}`);
});
