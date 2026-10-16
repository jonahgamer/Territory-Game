// dev-server.mjs
// Zero-dependency local dev server that mimics Vercel's routing.
//
// Usage:
//   node dev-server.mjs
//   PORT=4000 node dev-server.mjs
//
// Behavior:
//   /api/*.js  → dynamically import, call exported default handler
//   everything else → serve static files from the project root
//
// Loads .env from the project root (no dotenv dependency).

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

// ═══════════════════════════════════════════════════════════════════
// .env loader (inline, no dependency)
// ═══════════════════════════════════════════════════════════════════

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

// ═══════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '11451', 10);

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.mjs':   'text/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.webp':  'image/webp',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  '.map':   'application/json',
  '.txt':   'text/plain; charset=utf-8',
  '.md':    'text/plain; charset=utf-8',
};

// ═══════════════════════════════════════════════════════════════════
// Body reader (JSON + urlencoded + text)
// ═══════════════════════════════════════════════════════════════════

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 5_000_000) {
        req.destroy();
        return resolve(undefined);
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try { return resolve(JSON.parse(raw)); }
        catch { return resolve(undefined); }
      }
      if (ct.includes('application/x-www-form-urlencoded')) {
        const out = {};
        for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
        return resolve(out);
      }
      resolve(raw);
    });
    req.on('error', () => resolve(undefined));
  });
}

// ═══════════════════════════════════════════════════════════════════
// Response decorator (Vercel-style: res.status / json / send / redirect)
// ═══════════════════════════════════════════════════════════════════

function decorateRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };

  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(obj));
    return res;
  };

  res.send = (body) => {
    if (typeof body === 'object' && body !== null) {
      return res.json(body);
    }
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.end(String(body));
    return res;
  };

  res.redirect = (loc) => {
    res.statusCode = 302;
    res.setHeader('Location', loc);
    res.end();
    return res;
  };

  return res;
}

// ═══════════════════════════════════════════════════════════════════
// API routing
// ═══════════════════════════════════════════════════════════════════

async function handleApi(req, res, pathname) {
  let filePath = path.join(ROOT, pathname);

  // Try /api/foo.js or /api/foo/index.js
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.js');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.js')) {
    filePath = filePath + '.js';
  }

  // Path traversal guard
  const apiRoot = path.resolve(ROOT, 'api') + path.sep;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(apiRoot)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      message: `API route not found: ${pathname}`,
    }));
  }

  try {
    // Cache-bust so edits to API files pick up without restart
    const fileUrl = pathToFileURL(filePath).href + '?t=' + Date.now();
    const mod = await import(fileUrl);
    const handler = mod.default;

    if (typeof handler !== 'function') {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: false,
        message: `No default export function in ${pathname}`,
      }));
    }

    // Populate Vercel-style req properties
    const parsed = url.parse(req.url, true);
    req.query = parsed.query;
    req.body = await readBody(req);

    decorateRes(res);

    const t0 = Date.now();
    await handler(req, res);
    const dt = Date.now() - t0;

    console.log(`  [api] ${req.method} ${pathname} → ${res.statusCode} (${dt}ms)`);
  } catch (err) {
    console.error(`  [api error] ${pathname}`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        message: err.message || 'Internal error',
      }));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Static file serving
// ═══════════════════════════════════════════════════════════════════

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname);

  // Directory → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  // Extension-less → try .html
  else if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  // Path traversal guard
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!DOCTYPE html><meta charset="utf-8"><h1>404 Not Found</h1><p>${pathname}</p>`);
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
}

// ═══════════════════════════════════════════════════════════════════
// Server
// ═══════════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname;
  try { pathname = decodeURIComponent(parsed.pathname); }
  catch { pathname = parsed.pathname; }

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }
  serveStatic(req, res, pathname === '/' ? '/index.html' : pathname);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✖ Port ${PORT} is already in use.`);
    console.error(`    Try: PORT=3001 node dev-server.mjs\n`);
  } else {
    console.error('\n  ✖ Server error:', err.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('');
  console.log(`  ⚡  Dev server: http://localhost:${PORT}`);
  console.log('');
  console.log(`      Static files  →  ${ROOT}`);
  console.log(`      API routes    →  /api/*.js`);
  console.log(`      Env vars      →  .env`);
  console.log('');
  console.log(`      Edit and refresh. Press Ctrl+C to stop.`);
  console.log('');
});