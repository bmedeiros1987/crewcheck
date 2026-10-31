/**
 * Biblioteca local de musicas e fotos.
 *
 * Fonte preferida: o manifesto publicado pelo Laurinha Manager
 * (schema laurinha.hub.manifest/1), que ja traz playlists, albuns, capas e
 * as opcoes do Modo Quadro. Sem manifesto, o Hub varre MINHAS_MUSICAS e
 * FOTOS_LAURINHA direto do disco, para nao depender do Manager estar rodando.
 *
 * O Hub serve arquivo, entao todo caminho resolvido passa por uma checagem de
 * confinamento: nada fora da raiz da biblioteca pode ser lido, mesmo que o
 * manifesto peca.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ERRORS } from './errors.mjs';

const AUDIO_EXTENSIONS = new Set(['.mp3']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

export const AUDIO_CONTENT_TYPES = { '.mp3': 'audio/mpeg' };
export const IMAGE_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

function titleFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

/** true quando `candidate` esta realmente dentro de `root`. */
export function isInside(root, candidate) {
  if (!root) return false;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved === resolvedRoot) return true;
  return resolved.startsWith(resolvedRoot + path.sep);
}

function scanDir(dir, extensions, out, depth = 0) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full, extensions, out, depth + 1);
    } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function buildFromManifest(manifest, root) {
  const tracks = [];
  const photos = [];

  const manifestRoot = typeof manifest.root === 'string' ? manifest.root : '';
  const effectiveRoot = root || manifestRoot;

  const resolveEntry = (entry) => {
    // relativePath e o caminho canonico dentro da raiz; path absoluto e o
    // fallback do Manager para midia fora da raiz.
    if (entry.relativePath && effectiveRoot) {
      return path.resolve(effectiveRoot, entry.relativePath.split('/').join(path.sep));
    }
    if (entry.path) return path.resolve(entry.path);
    return null;
  };

  for (const entry of manifest?.music?.tracks || []) {
    const filePath = resolveEntry(entry);
    if (!filePath) continue;
    tracks.push({
      id: `t${entry.id}`,
      title: String(entry.title || titleFromPath(filePath)),
      path: filePath,
      missing: entry.missing === true,
    });
  }

  for (const entry of manifest?.photos?.photos || []) {
    const filePath = resolveEntry(entry);
    if (!filePath) continue;
    photos.push({
      id: `p${entry.id}`,
      title: String(entry.title || titleFromPath(filePath)),
      path: filePath,
      missing: entry.missing === true,
    });
  }

  const playlists = (manifest?.music?.playlists || []).map((playlist, index) => ({
    id: `pl${index}`,
    name: String(playlist.name || `Playlist ${index + 1}`),
    trackIds: (playlist.tracks || [])
      .map((trackIndex) => `t${trackIndex}`)
      .filter((id) => tracks.some((track) => track.id === id)),
  }));

  const albums = (manifest?.photos?.albums || []).map((album, index) => ({
    id: `al${index}`,
    name: String(album.name || `Album ${index + 1}`),
    coverId: album.cover != null && album.cover >= 0 ? `p${album.cover}` : null,
    intervalSeconds: Number.isFinite(album.intervalSeconds) ? album.intervalSeconds : 10,
    photoIds: (album.photos || [])
      .map((photoIndex) => `p${photoIndex}`)
      .filter((id) => photos.some((photo) => photo.id === id)),
  }));

  return {
    source: 'manifest',
    root: effectiveRoot,
    tracks,
    photos,
    playlists,
    albums,
    frameMode: manifest?.frameMode || null,
    generatedAt: manifest?.generatedAt || null,
  };
}

function buildFromDisk(config) {
  const root = config.media.root;
  const musicDir = path.join(root, config.media.musicDir);
  const photosDir = path.join(root, config.media.photosDir);

  const tracks = scanDir(musicDir, AUDIO_EXTENSIONS, []).sort().map((filePath, index) => ({
    id: `t${index}`,
    title: titleFromPath(filePath),
    path: filePath,
    missing: false,
  }));
  const photos = scanDir(photosDir, IMAGE_EXTENSIONS, []).sort().map((filePath, index) => ({
    id: `p${index}`,
    title: titleFromPath(filePath),
    path: filePath,
    missing: false,
  }));

  return {
    source: 'disk',
    root,
    tracks,
    photos,
    playlists: [],
    albums: [],
    frameMode: null,
    generatedAt: null,
  };
}

const EMPTY_LIBRARY = {
  source: 'none',
  root: '',
  tracks: [],
  photos: [],
  playlists: [],
  albums: [],
  frameMode: null,
  generatedAt: null,
};

export function createLibrary({ config, readFileSync = fs.readFileSync, existsSync = fs.existsSync, now = Date.now }) {
  let cache = null;
  let loadedAt = 0;
  let lastError = null;
  const ttlMs = 15000;

  function load(force = false) {
    if (!force && cache && now() - loadedAt < ttlMs) return cache;

    lastError = null;
    try {
      if (config.media.manifestPath && existsSync(config.media.manifestPath)) {
        const raw = readFileSync(config.media.manifestPath, 'utf8');
        const manifest = JSON.parse(raw.replace(/^﻿/, ''));
        cache = buildFromManifest(manifest, config.media.root);
      } else if (config.media.root && existsSync(config.media.root)) {
        cache = buildFromDisk(config);
      } else {
        cache = { ...EMPTY_LIBRARY };
        lastError = config.media.root || config.media.manifestPath
          ? 'A pasta da biblioteca configurada nao existe.'
          : 'Nenhuma biblioteca configurada (LAURINHA_MEDIA_ROOT ou LAURINHA_MANIFEST).';
      }
    } catch (error) {
      cache = { ...EMPTY_LIBRARY };
      lastError = `Falha ao ler a biblioteca: ${error.message}`;
    }

    loadedAt = now();
    return cache;
  }

  return {
    reload() {
      return load(true);
    },

    snapshot() {
      return load();
    },

    get lastError() {
      return lastError;
    },

    /** Busca paginada: 315 musicas nao cabem numa tela de TV. */
    searchTracks({ query = '', limit = 50, offset = 0 } = {}) {
      const library = load();
      const needle = String(query || '').trim().toLowerCase();
      const filtered = needle
        ? library.tracks.filter((track) => track.title.toLowerCase().includes(needle))
        : library.tracks;
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      return {
        total: filtered.length,
        limit: safeLimit,
        offset: safeOffset,
        items: filtered.slice(safeOffset, safeOffset + safeLimit),
      };
    },

    findTrack(id) {
      return load().tracks.find((track) => track.id === id) || null;
    },

    findPhoto(id) {
      return load().photos.find((photo) => photo.id === id) || null;
    },

    /**
     * Resolve o arquivo de uma midia para servir por HTTP.
     * Recusa qualquer caminho fora da raiz da biblioteca.
     */
    resolveMediaFile(kind, id) {
      const library = load();
      const item = kind === 'photo' ? this.findPhoto(id) : this.findTrack(id);
      if (!item) throw ERRORS.mediaNotFound();

      const allowedRoots = [library.root, config.media.root].filter(Boolean);
      if (allowedRoots.length && !allowedRoots.some((root) => isInside(root, item.path))) {
        // Manifesto pode apontar para midia fora da raiz; o Hub nao serve isso.
        throw ERRORS.mediaNotFound();
      }
      if (!existsSync(item.path)) throw ERRORS.mediaNotFound();

      const extension = path.extname(item.path).toLowerCase();
      const contentType = kind === 'photo'
        ? IMAGE_CONTENT_TYPES[extension]
        : AUDIO_CONTENT_TYPES[extension];
      if (!contentType) throw ERRORS.mediaNotFound();

      return { item, filePath: item.path, contentType };
    },

    stats() {
      const library = load();
      return {
        source: library.source,
        trackCount: library.tracks.length,
        photoCount: library.photos.length,
        playlistCount: library.playlists.length,
        albumCount: library.albums.length,
        generatedAt: library.generatedAt,
        error: lastError,
      };
    },
  };
}
