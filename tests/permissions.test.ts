import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Executa o SQL real em Postgres isolado. Auth/Storage são contratos mínimos,
// não conexões ao projeto Supabase de produção nem testes de envio de e-mail.
test("RLS: visitante vê somente públicos e outra conta não pode alterar listas", async () => {
  const db = new PGlite();
  const alice = "00000000-0000-0000-0000-000000000001";
  const bob = "10000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id bigint, bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql immutable as
        $$ select string_to_array($1, '/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
    `);
    for (const file of ["schema.sql", "etapa-6-banner.sql"]) {
      await db.exec(
        await readFile(new URL("../supabase/" + file, import.meta.url), "utf8"),
      );
    }
    await db.query(
      `insert into auth.users values ($1, '{"display_name":"Alice"}'), ($2, '{"display_name":"Bob"}')`,
      [alice, bob],
    );
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      2,
      "trigger cria perfis",
    );
    await db.query(
      `update public.profiles set username='alice', is_public=true where id=$1`,
      [alice],
    );
    await db.query(`update public.profiles set username='bobby' where id=$1`, [
      bob,
    ]);
    await db.query(
      `insert into public.library_entries (user_id,anime_id,anime_title,status) values ($1,1,'Anime A','watching'),($2,2,'Anime B','planned')`,
      [alice, bob],
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.library_entries")).rows.length,
      1,
    );
    await assert.rejects(
      db.exec("delete from public.library_entries"),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      bob,
    ]);
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      2,
      "próprio privado + alheio público",
    );
    assert.equal(
      (
        await db.query(
          `update public.library_entries set anime_title='Invasão' where user_id=$1 returning *`,
          [alice],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `delete from public.library_entries where user_id=$1 returning *`,
          [alice],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `update public.profiles set is_public=false where id=$1 returning *`,
          [alice],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        `insert into public.library_entries (user_id,anime_id,anime_title,status) values ($1,3,'Invasão','planned')`,
        [alice],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(`insert into storage.objects values (1,'tracker-banners',$1)`, [
        alice + "/banner.jpg",
      ]),
      /row-level security/,
    );
    await db.query(
      `insert into storage.objects values (2,'tracker-banners',$1)`,
      [bob + "/banner.jpg"],
    );
    assert.equal(
      (
        await db.query(
          `update public.library_entries set watched_episodes=1 where user_id=$1 returning *`,
          [bob],
        )
      ).rows.length,
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      alice,
    ]);
    await db.query("update public.profiles set is_public=false where id=$1", [
      alice,
    ]);
    await db.exec("reset role; set role anon");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    assert.equal(
      (await db.query("select * from public.library_entries")).rows.length,
      0,
      "tornar privado remove acesso público",
    );
  } finally {
    await db.close();
  }
});
