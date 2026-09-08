import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("Postgres migrations deny applicant access, atomically persist records and deduplicate receipts", async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase-managed storage/roles scaffold. Application SQL is applied unchanged.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now());
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant all on storage.objects to anon, authenticated;
      create policy existing_broad_policy on storage.objects for all to anon, authenticated using (true) with check (true);
    `);
    const setup = await readFile("SUPABASE_SETUP.sql", "utf8");
    for (const migration of ["202609070001_application_intake.sql", "202609070002_document_reconciliation.sql", "202609080003_admin_portal.sql", "202609080004_admin_workflow_and_documents.sql", "202609080005_admin_provisioning.sql"]) {
      assert.ok(setup.includes((await readFile(`supabase/migrations/${migration}`, "utf8")).trim()), "Regenerate the setup file when a migration changes.");
    }
    await db.exec(setup);
    await db.exec(await readFile("supabase/tests/access.sql", "utf8"));

    const id = randomUUID();
    const fingerprint = "a".repeat(64);
    const metadata = { firstName: "Test", lastName: "Applicant", dateOfBirth: "1990-01-15", address: "Test address", email: "test@example.com", phone: "2025550123", positionDesired: "Engineer", previousEmployer: "N/A", consent: true };
    const envelope = { algorithm: "aes-256-gcm", key_id: "test", nonce: "fixture", ciphertext: "fixture", tag: "fixture" };
    const docs = ["idFront", "idBack", "resume"].map(kind => ({ kind, object_key: `${id}/${randomUUID()}`, mime_type: "application/pdf", size_bytes: 100 }));
    const submit = (applicationId = id, hash = fingerprint, documents = docs) => db.query<{ receipt: { reference: string; created: boolean } }>(
      "select public.submit_job_application($1::uuid,$2::text,$3::jsonb,$4::jsonb,$5::jsonb) as receipt",
      [applicationId, hash, JSON.stringify(metadata), JSON.stringify(envelope), JSON.stringify(documents)],
    );
    const result = (await submit()).rows[0].receipt;
    assert.match(result.reference, /^WHD-[A-F0-9]{8}$/);
    assert.equal(result.created, true);
    assert.deepEqual((await submit()).rows[0].receipt, { ...result, created: false });
    await assert.rejects(submit(id, "b".repeat(64)), /Submission conflict/);
    assert.equal((await db.query<{ total: number }>("select count(*)::integer as total from public.job_applications")).rows[0].total, 1);
    assert.equal((await db.query<{ total: number }>("select count(*)::integer as total from private.application_documents where scan_status = 'pending'")).rows[0].total, 3);

    const invalidId = randomUUID();
    const invalidDocs = docs.map(doc => ({ ...doc, object_key: `${invalidId}/${randomUUID()}`, size_bytes: 2_000_000 }));
    await assert.rejects(submit(invalidId, fingerprint, invalidDocs));
    assert.equal((await db.query<{ total: number }>("select count(*)::integer as total from public.job_applications")).rows[0].total, 1, "failed document write must roll back metadata");

    for (let attempt = 1; attempt <= 6; attempt++) {
      const allowed = (await db.query<{ allowed: boolean }>("select public.consume_application_rate_limit($1) as allowed", ["c".repeat(64)])).rows[0].allowed;
      assert.equal(allowed, attempt <= 5);
    }
    await db.query("insert into storage.objects (bucket_id,name,created_at) values ('application-documents',$1,now()-interval '2 days'),('application-documents',$2,now()-interval '2 days')", [docs[0].object_key, `${randomUUID()}/${randomUUID()}`]);
    assert.equal((await db.query("select * from public.list_orphaned_application_documents()")).rows.length, 1);

    const staffId = randomUUID(); const outsider = randomUUID(); const unconfirmed = randomUUID();
    await db.query("insert into auth.users(id, email_confirmed_at) values ($1, now()),($2, now()),($3, null)", [staffId, outsider, unconfirmed]);
    await db.query("insert into private.admin_staff(user_id) values ($1)", [staffId]);
    await db.query("select public.admin_provision_staff($1, $2)", [staffId, outsider]);
    assert.equal((await db.query<{ active: boolean }>("select active from private.admin_staff where user_id=$1", [outsider])).rows[0].active, true);
    await assert.rejects(db.query("select public.admin_provision_staff($1, $2)", [staffId, unconfirmed]), /confirmed email/);
    await assert.rejects(db.query("select public.admin_revoke_staff($1, $2)", [staffId, staffId]), /own access/);
    await db.query("select public.admin_revoke_staff($1, $2)", [outsider, staffId]);
    assert.equal((await db.query<{ active: boolean }>("select active from private.admin_staff where user_id=$1", [staffId])).rows[0].active, false);
    await db.query("select public.admin_provision_staff($1, $2)", [outsider, staffId]);
    await assert.rejects(db.query("select public.admin_get_application($1,$2)", [unconfirmed, id]), /Not authorized/);
    await assert.rejects(db.query("select public.admin_get_document_for_download($1,$2,'resume')", [staffId, id]), /Document unavailable/);
    await db.query("update private.application_documents set scan_status='clean' where application_id=$1 and kind='resume'", [id]);
    const download = await db.query<{ path: string }>("select public.admin_get_document_for_download($1,$2,'resume') as path", [staffId, id]);
    assert.equal(download.rows[0].path, docs[2].object_key);
    await assert.rejects(db.query("select public.admin_get_document_for_download($1,$2,'resume')", [unconfirmed, id]), /Not authorized/);
    for (const status of ['reviewing', 'shortlisted', 'rejected', 'received']) {
      await db.query("select public.admin_update_application_status($1,$2,$3)", [staffId, id, status]);
      assert.equal((await db.query<{ status: string }>("select status from public.job_applications where id=$1", [id])).rows[0].status, status);
    }
    await assert.rejects(db.query("select public.admin_update_application_status($1,$2,'closed')", [staffId, id]), /Invalid status/);
    const search = async (query: string | null, status: string | null, position: string | null = null, from: string | null = null, to: string | null = null) =>
      (await db.query<{ result: { total: number; applications: unknown[]; counts: { total: number } } }>("select public.admin_search_applications($1,$2,$3,$4,$5::date,$6::date,0) as result", [staffId, query, status, position, from, to])).rows[0].result;
    assert.equal((await search('test@example.com', 'received', 'Engineer')).total, 1);
    assert.equal((await search('no matching applicant', null)).total, 0);
    assert.equal((await search(null, 'shortlisted')).total, 0);
    assert.equal((await search(null, null, 'Different position')).total, 0);
    assert.equal((await search(null, null, null, '2000-01-01', '2001-01-01')).total, 0);
    assert.equal((await search('no match', null)).counts.total, 1, 'overview is independent of filters');
    assert.ok(!JSON.stringify((await search(null, null)).applications).includes('ssn'));
    await db.query("select public.admin_record_login($1)", [staffId]);
    assert.equal((await db.query("select * from private.admin_audit_events where action='document_download'")).rows.length, 1);
    await db.query("update private.admin_staff set active=false where user_id=$1", [staffId]);
    await assert.rejects(search(null, null), /Not authorized/);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.job_applications"), /permission denied/);
      await assert.rejects(db.query("select * from private.application_secrets"), /permission denied/);
      await assert.rejects(db.query("select public.consume_application_rate_limit($1)", ["d".repeat(64)]), /permission denied/);
      await assert.rejects(db.query("select public.admin_get_document_for_download($1,$2,'resume')", [staffId, id]), /permission denied/);
      await assert.rejects(db.query("select public.admin_search_applications($1)", [staffId]), /permission denied/);
      await assert.rejects(db.query("select public.admin_provision_staff($1,$2)", [staffId, outsider]), /permission denied/);
      await assert.rejects(db.query("select public.admin_revoke_staff($1,$2)", [staffId, outsider]), /permission denied/);
      assert.equal((await db.query("select * from storage.objects where bucket_id = 'application-documents'")).rows.length, 0, "restrictive policy overrides broad storage grants");
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});
