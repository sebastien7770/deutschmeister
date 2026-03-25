// server.js — DeutschMeister v2
import Anthropic from '@anthropic-ai/sdk';
import { execFile }  from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const execAsync  = promisify(execFile);
const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PORT       = process.env.PORT || 3000;

// ── Auth ──────────────────────────────────────────────────────────
const sessions   = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 h

const USERS = {
  [process.env.PROF_USER  || 'prof']:  { pass: process.env.PROF_PASS  || 'prof',  role: 'prof' },
  [process.env.ELEVE_USER || 'eleve']: { pass: process.env.ELEVE_PASS || 'eleve', role: 'eleve' },
};

function authenticate(req) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// Nettoyage périodique des sessions expirées
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(token);
  }
}, 30 * 60 * 1000);

// ── MIME types ────────────────────────────────────────────────────
const MIME = {
  html: 'text/html; charset=utf-8',
  css:  'text/css',
  js:   'application/javascript',
  png:  'image/png',
  ico:  'image/x-icon',
  svg:  'image/svg+xml',
  json: 'application/json',
};

// ── Helpers ───────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJSON(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': MIME.json });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('JSON invalide')); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const pub  = join(__dirname, 'public');
  const path = join(pub, req.url === '/' ? 'index.html' : req.url);
  if (!path.startsWith(pub)) { res.writeHead(403); res.end(); return; }
  const ext  = path.split('.').pop();
  try {
    cors(res);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(readFileSync(path));
  } catch { res.writeHead(404); res.end('Not found'); }
}

// ── /api/login ───────────────────────────────────────────────────
async function handleLogin(req, res) {
  const { username, password } = await readBody(req);
  const entry = USERS[username];
  if (!entry || entry.pass !== password) {
    return sendJSON(res, { error: 'Identifiants incorrects' }, 401);
  }
  const token = randomUUID();
  sessions.set(token, { role: entry.role, createdAt: Date.now() });
  sendJSON(res, { token, role: entry.role });
}

function handleMe(req, res) {
  const session = authenticate(req);
  if (!session) return sendJSON(res, { error: 'Non autorisé' }, 401);
  sendJSON(res, { role: session.role });
}

function handleLogout(req, res) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) sessions.delete(auth.slice(7));
  sendJSON(res, { ok: true });
}

// ── /api/generate — Anthropic ────────────────────────────────────
async function handleGenerate(req, res) {
  const { system, user, messages, max_tokens = 2500 } = await readBody(req);
  if (!system) return sendJSON(res, { error: 'Paramètre system manquant' }, 400);

  const msgs = messages ?? [{ role: 'user', content: user ?? '' }];
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      system,
      messages: msgs,
    });
    sendJSON(res, { content: r.content?.[0]?.text ?? '' });
  } catch (e) {
    console.error('Anthropic:', e.message);
    sendJSON(res, { error: e.message }, 500);
  }
}

// ── /api/docx — Word generator (Node.js / docx-js) ───────────────
async function handleDocx(req, res) {
  const { content, meta = {} } = await readBody(req);
  if (!content) return sendJSON(res, { error: 'content manquant' }, 400);

  const genScript = join(__dirname, 'lib', 'make_docx.mjs');
  const tmpTxt    = join(tmpdir(), `dm_${randomUUID()}.txt`);
  const tmpDocx   = join(tmpdir(), `dm_${randomUUID()}.docx`);

  writeFileSync(tmpTxt, content, 'utf8');
  try {
    await execAsync('node', [
      genScript, tmpTxt, tmpDocx,
      meta.tool   ?? 'ressource',
      meta.classe ?? 'Lycee',
      meta.niveau ?? 'A2',
      meta.theme  ?? '',
    ], { timeout: 45000 });

    if (!existsSync(tmpDocx)) throw new Error('DOCX non généré');
    const buf = readFileSync(tmpDocx);

    cors(res);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="deutschmeister_${meta.tool ?? 'ressource'}.docx"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  } catch (e) {
    console.error('DOCX:', e.message);
    sendJSON(res, { error: 'Erreur DOCX : ' + e.message }, 500);
  } finally {
    if (existsSync(tmpTxt))  unlinkSync(tmpTxt);
    if (existsSync(tmpDocx)) unlinkSync(tmpDocx);
  }
}

// ── /api/pdf — PDF generator (Python / ReportLab) ────────────────
async function handlePdf(req, res) {
  const { content, meta = {} } = await readBody(req);
  if (!content) return sendJSON(res, { error: 'content manquant' }, 400);

  const genScript = join(__dirname, 'lib', 'make_pdf.py');
  const tmpTxt    = join(tmpdir(), `dm_${randomUUID()}.txt`);
  const tmpPdf    = join(tmpdir(), `dm_${randomUUID()}.pdf`);

  writeFileSync(tmpTxt, content, 'utf8');
  try {
    await execAsync('python3', [
      genScript, tmpTxt, tmpPdf,
      meta.tool   ?? 'ressource',
      meta.classe ?? 'Lycee',
      meta.niveau ?? 'A2',
      meta.theme  ?? '',
    ], { timeout: 45000 });

    if (!existsSync(tmpPdf)) throw new Error('PDF non généré');
    const buf = readFileSync(tmpPdf);

    cors(res);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="deutschmeister_${meta.tool ?? 'ressource'}.pdf"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  } catch (e) {
    console.error('PDF:', e.message);
    sendJSON(res, { error: 'Erreur PDF : ' + e.message }, 500);
  } finally {
    if (existsSync(tmpTxt)) unlinkSync(tmpTxt);
    if (existsSync(tmpPdf)) unlinkSync(tmpPdf);
  }
}

// ── Router ────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
  try {
    // Routes publiques (auth)
    if (req.method === 'POST' && req.url === '/api/login')  return await handleLogin(req, res);
    if (req.method === 'GET'  && req.url === '/api/me')     return handleMe(req, res);
    if (req.method === 'POST' && req.url === '/api/logout') return handleLogout(req, res);

    // Routes protégées
    if (req.url.startsWith('/api/')) {
      if (!authenticate(req)) return sendJSON(res, { error: 'Non autorisé' }, 401);
    }

    if (req.method === 'POST' && req.url === '/api/generate') return await handleGenerate(req, res);
    if (req.method === 'POST' && req.url === '/api/docx')     return await handleDocx(req, res);
    if (req.method === 'POST' && req.url === '/api/pdf')      return await handlePdf(req, res);
    if (req.method === 'GET')                                  return serveStatic(req, res);
    sendJSON(res, { error: 'Route introuvable' }, 404);
  } catch (e) {
    console.error('Server:', e);
    sendJSON(res, { error: 'Erreur serveur' }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`✅  DeutschMeister v2 → http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY)
    console.warn('⚠️  ANTHROPIC_API_KEY non définie !');
});
