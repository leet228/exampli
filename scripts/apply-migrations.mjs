#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const MIN_MIGRATION_NUMBER = 5;
const MIGRATIONS_DIR = path.resolve('db', 'migrations');
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    '[migrations] Missing SUPABASE_DB_URL (or DATABASE_URL). Cannot apply migrations automatically.',
  );
  process.exit(1);
}

async function ensureTable(client) {
  await client.query(`
    create table if not exists public.app_migrations (
      id serial primary key,
      name text unique not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function alreadyApplied(client, name) {
  const { rows } = await client.query('select 1 from public.app_migrations where name = $1', [name]);
  return rows.length > 0;
}

async function applyMigration(client, filePath, name) {
  const sql = await fs.readFile(filePath, 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('insert into public.app_migrations (name) values ($1)', [name]);
    await client.query('commit');
    console.log(`[migrations] applied ${name}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`[migrations] failed ${name}`, err);
    throw err;
  }
}

async function main() {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => /^\d+_/.test(file));
  files.sort((a, b) => a.localeCompare(b));

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await ensureTable(client);
    for (const file of files) {
      const number = Number(file.split('_')[0]);
      if (!Number.isFinite(number) || number < MIN_MIGRATION_NUMBER) continue;
      if (await alreadyApplied(client, file)) {
        console.log(`[migrations] skip ${file} (already applied)`);
        continue;
      }
      const fullPath = path.join(MIGRATIONS_DIR, file);
      await applyMigration(client, fullPath, file);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrations] fatal error', err);
  process.exit(1);
});


