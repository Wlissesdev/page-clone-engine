import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

import { cloneProductPage } from './src/cloneEngine.js';
import { listProjects, readProject, deleteProject, projectsRoot } from './src/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/clones', express.static(projectsRoot, {
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
}));

function normalizeHttpUrl(value, fieldName = 'URL') {
  let raw = String(value || '').trim();
  if (!raw) return '';

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  let u;
  try {
    u = new URL(raw);
  } catch {
    const err = new Error(`${fieldName} inválida.`);
    err.statusCode = 400;
    throw err;
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    const err = new Error(`${fieldName} deve usar http:// ou https://.`);
    err.statusCode = 400;
    throw err;
  }

  return u.toString();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.4.0' });
});

app.get('/api/projects', async (req, res, next) => {
  try {
    res.json(await listProjects());
  } catch (err) {
    next(err);
  }
});

app.get('/api/projects/:id', async (req, res, next) => {
  try {
    const project = await readProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    let config = {};
    try {
      config = JSON.parse(
        await fs.readFile(path.join(projectsRoot, req.params.id, 'clone-config.json'), 'utf8')
      );
    } catch {}

    res.json({ ...project, config });
  } catch (err) {
    next(err);
  }
});

app.post('/api/clone', async (req, res, next) => {
  try {
    const {
      url,
      projectName = '',
      waitMs = 1500,
      buyUrl = '',
      cleanOverlays = true,
      captureAllFormats = true
    } = req.body || {};

    if (!url) return res.status(400).json({ error: 'Informe uma URL pública de produto.' });

    const sourceUrl = normalizeHttpUrl(url, 'URL do produto');
    const safeBuyUrl = normalizeHttpUrl(buyUrl, 'Link do botão Comprar');

    const result = await cloneProductPage({
      url: sourceUrl,
      projectName,
      waitMs: Math.max(0, Math.min(Number(waitMs) || 0, 10000)),
      baseUrl: `http://${HOST}:${PORT}`,
      captureAllFormats: captureAllFormats !== false,
      cloneConfig: {
        buyUrl: safeBuyUrl,
        cleanOverlays: cleanOverlays !== false
      }
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/projects/:id/config', async (req, res, next) => {
  try {
    const project = await readProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const configPath = path.join(projectsRoot, req.params.id, 'clone-config.json');

    let config = {};
    try {
      config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    } catch {}

    if ('buyUrl' in (req.body || {})) {
      config.buyUrl = normalizeHttpUrl(req.body.buyUrl || '', 'Link do botão Comprar');
    }

    if ('cleanOverlays' in (req.body || {})) {
      config.cleanOverlays = Boolean(req.body.cleanOverlays);
    }

    config.updatedAt = new Date().toISOString();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    res.json({ ok: true, config });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/projects/:id', async (req, res, next) => {
  try {
    res.json({ ok: await deleteProject(req.params.id) });
  } catch (err) {
    next(err);
  }
});

app.get('/api/projects/:id/download', async (req, res, next) => {
  try {
    const project = await readProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const dir = path.join(projectsRoot, req.params.id);
    const zipPath = path.join(dir, 'export.zip');

    await new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.glob('**/*', { cwd: dir, ignore: ['export.zip'] });
      archive.finalize();
    });

    res.download(zipPath, `${req.params.id}.zip`);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err?.statusCode || 500).json({
    error: err?.message || 'Erro interno.'
  });
});

await fs.mkdir(projectsRoot, { recursive: true });

app.listen(PORT, HOST, () => {
  console.log(`\nPage Clone Engine v0.4: http://${HOST}:${PORT}`);
  console.log('Config local corrigida, redirect responsivo inicial, galeria/título mobile restaurados e skeletons congelados.\n');
});
