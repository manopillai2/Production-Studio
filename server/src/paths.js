import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..', '..');
export const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(ROOT_DIR, 'storage');
export const MEDIA_DIR = path.join(STORAGE_DIR, 'media');
export const EXPORT_DIR = path.join(MEDIA_DIR, 'exports');
export const TMP_DIR = path.join(STORAGE_DIR, 'tmp');
export const DB_PATH = path.join(STORAGE_DIR, 'studio.sqlite');
export const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');
