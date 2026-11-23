import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectsRoot = path.resolve(__dirname, '..', 'data', 'projects');

export async function listProjects() {
  await fs.mkdir(projectsRoot, { recursive: true });
  const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(projectsRoot, entry.name, 'meta.json'), 'utf8')
      );
      projects.push(meta);
    } catch {}
  }

  return projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function readProject(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;

  try {
    const meta = JSON.parse(
      await fs.readFile(path.join(projectsRoot, id, 'meta.json'), 'utf8')
    );

    let product = {};
    try {
      product = JSON.parse(
        await fs.readFile(path.join(projectsRoot, id, 'product.json'), 'utf8')
      );
    } catch {}

    return { ...meta, product };
  } catch {
    return null;
  }
}

export async function deleteProject(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;

  try {
    await fs.rm(path.join(projectsRoot, id), {
      recursive: true,
      force: true
    });
    return true;
  } catch {
    return false;
  }
}
