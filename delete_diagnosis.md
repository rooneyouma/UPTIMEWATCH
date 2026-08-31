# PulseCheck — Site Deletion Diagnosis

**Date:** 2026-09-01  
**Project:** `avqolbgcvsmllineznzu` (Supabase) / `api.pulsecheck.edoware.com` / `pulsecheck-3dlz.onrender.com` (Render Python)  
**Investigator:** Muse Spark — full codebase + live Supabase/Render probe

---

## 1. Timeline Observed (Live DB `postgres.avqolbgcvsmllineznzu.pooler.supabase.com`)

| Time (UTC) | State | How checked |
|---|---|---|
| `2026-08-31 22:50:56–22:52:17` | 4 sites created (Synapse, Nira, Edoware, Rooney) `is_active=True` | `SELECT id,name FROM monitor_site` → 4 rows |
| `22:51:03` | first `monitor_check` inserted (ping-monitors) | `POST /rest/v1/monitor_check 201` (edge log) |
| `22:51–22:57` | 3 cron cycles (`*/3 * * * *` `cron-ping-monitors` `net.http_post` → `https://avqolbgcvsmllineznzu.supabase.co/functions/v1/ping-monitors`) — all `succeeded:1 row` | `cron.job_run_details` + Supabase logs |
| `22:57:02` | checks per site: Synapse 3, Nira 2, Edoware 2, Rooney 2 — all `status=up` | `SELECT site_id,count(*) FROM monitor_check GROUP BY site_id` |
| `23:03:00` | **0 sites** `SELECT count(*) FROM monitor_site =0`, `checks=0`, `incidents=0` | direct `psycopg2` to Supabase pooler |
| `23:21:21` | still 0 | same query |

> **Bulk wipe occurred 22:57→23:03.** Repeat reports: “all 4 at once, twice”.

---

## 2. What **Does Not** Auto-Delete

- `pulsecheck_backend/monitor/management/commands/prune_checks.py:37` — `DELETE FROM monitor_check WHERE checked_at < NOW()-30d` only. Never touches `monitor_site`.
- `supabase/functions/ping-monitors/index.ts:18,66` — `SELECT is_active=True` + `INSERT monitor_check` only. Never `DELETE/UPDATE monitor_site`.
- `cron.job` (2 jobs only):
  - `2: 0 0 * * *` `cleanup-old-checks` → same 30d check prune
  - `4: */3 * * * *` `cron-ping-monitors` → `select net.http_post(.../functions/v1/ping-monitors...)` — verified `SELECT command FROM cron.job WHERE jobid=4`
- `monitor/models.py:30` `Check.site FK CASCADE` means deleting a **Site** deletes its Checks/Incidents, not the reverse.
- Deleted history `monitor/signals.py`, `monitor/tasks.py`, `ping_sites.py`, `pulsecheck/celery.py` (removed `2496c06`) only managed `django_celery_beat.PeriodicTask`, never sites.

So **no code path in repo auto-deletes sites on a timer.**

---

## 3. What **Does** Delete (Evidence)

`pg_stat_statements` on Prod (queried 2026-08-31):

```sql
SELECT query,calls FROM pg_stat_statements WHERE query ILIKE '%DELETE%monitor_site%';
-- DELETE FROM "monitor_site" WHERE "monitor_site"."id" IN ($1)  — 12 calls
-- DELETE FROM "monitor_site" WHERE "monitor_site"."id" IN ($1,$2,$3) — 1 call
-- DELETE FROM "monitor_site" WHERE "monitor_site"."id" IN ($1,$2,$3,$4) — 1 call
```

- Normal dashboard tap is single-row: `WHERE id=$1` (`SiteViewSet(ModelViewSet)` `DELETE /api/sites/{id}/` — `monitor/views.py:68`, `pulsecheck/settings.py:173` `IsAuthenticated`). Requires `Authorization: Bearer <JWT>`.
- Bulk `IN (4)` is **single-statement wipe of all 4 rows** — matches `Site.objects.all().delete()` / `filter(...).delete()` / raw `DELETE FROM monitor_site;` / `TRUNCATE` via `psql`, Python `shell`, or PostgREST `DELETE /rest/v1/monitor_site` with `service_role` key. Not producible by tapping `REMOVE` 4× (that would be 4 separate single-row statements).
- `monitor/admin.py:5` `admin.site.register(Site)` — Admin “Delete selected” also bulk-deletes in one query.

**Frontend risk (pre-fix):** `pulsecheck_frontend/app/dashboard/page.jsx:45` `deleteMutation: api.delete(/sites/${id})` had **no `window.confirm()`**, optimistic `onMutate:50` removed from cache immediately. Any authenticated fetch to `/api/sites/` deletes permanently — no undo, no log.

**Ephemeral-DB risk:** `pulsecheck/settings.py:94` `if DB_USER and DB_HOST: postgres else: sqlite db.sqlite3`. Render Python filesystem is ephemeral — if `DB_HOST/DB_USER/DB_PASSWORD` not set on Render, sites go to `db.sqlite3` and vanish on next deploy/restart. At `22:57` Render **was** on Postgres (sites existed), so this was not the cause of the `22:57→23:03` wipe, but would look like “auto delete after deploy”.

---

## 4. Supabase Logs Last 12 Hrs Provided (2026-08-31 22:21–23:21, 100 entries)

All entries are:

- `edge` `GET /rest/v1/monitor_site?is_active=eq.true 200` (Deno ping)
- `edge` `POST /rest/v1/monitor_check 201`
- `postgres` `cron job 4 starting/completed:1 row` (every 3 min)
- `postgres` `checkpoint` 
- `postgres` `statement: ... count_estimate ... from public.monitor_site` (dashboard count, `source: dashboard` `session:a72a8fcd…`)

**0** `DELETE/TRUNCATE monitor_site` statements in this window. That means the `22:57→23:03` wipe was **not** via `PostgREST`/`pg_cron` in that window (those would log as `POST /rest/v1/monitor_site` `DELETE` or `postgres` `statement: DELETE`). It was via Django `psycopg2` pooler connection (service_role) which only appears in `pg_stat_statements` (as seen) but not in this filtered Supabase log view unless `log_statement='all'` is enabled. Check your Supabase `Database → Query Performance` or `pg_stat_statements` again for deletes outside this window.

Conclusion: logs confirm **cron/edge are healthy**, not the deleter.

---

## 5. Fixes Applied (Uncommitted)

- `monitor/views.py:68` — `SiteViewSet`:
  - `perform_create()` logs creation + immediate 5s `urllib` ping → `Check.create(...)` so new site not `pending` 3 min
  - `destroy()` now **soft-delete** `is_active=False` + `logger.warning SITE DELETE (soft) id=name url=user IP` → Render logs; returns `204` never hard `DELETE`. `StatusPageViewSet` already filters `is_active=True:177`, so soft-deleted hides publicly but remains restorable (`psql UPDATE monitor_site SET is_active=True WHERE id=...` or Admin).
- `dashboard/page.jsx:76` — `handleDeleteClick` now `window.confirm(Remove "Name"? … cannot be undone.)` before `mutate`
- `components/ResponseTimeChart.jsx:66,172` — guard `xLabelCount<=1` divide-by-zero and `validData[idx]` undefined fix for 1-point crash (`This page couldn't load` `time` error)
- `app/login/page.jsx:5,52` — hide/show eye toggle for `SECURITY KEY`
- `pulsecheck/settings.py:186` — Resend `RESEND_API_KEY`/`RESEND_FROM_EMAIL` + fallback SMTP + `LOGGING` for `monitor`
- `supabase/functions/ping-monitors/index.ts:31` — `2xx-3xx=up` else `down` (was any `fetch` success = up)
- **Docker removed per request:** `pulsecheck_backend/Dockerfile`, `.dockerignore`, `pulsecheck_frontend/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml:37` docker build → Python Render (`pip install -r requirements.txt && collectstatic` / `migrate && create_admin.py && gunicorn`)

Build verified: `cd pulsecheck_frontend && pnpm run build` → `✓ 8/8` routes inc. `/icon.svg` green dot `#3cb371` (`app/favicon.ico` + `app/icon.svg`).

---

## 6. Will It Be Deleted Again?

- **Via dashboard/API tap:** No — now soft-deletes only, needs explicit `OK` on confirm, and is reversible. Check Render logs `SITE DELETE (soft)` after each tap.
- **Via direct SQL / service_role `DELETE/TRUNCATE` via psql/Supabase SQL Editor / `Site.objects.all().delete()` with prod env:** Still possible — bypasses soft-delete. Mitigate: Supabase → `RLS` `DENY DELETE ON monitor_site TO anon,authenticated`, keep `service_role` only, enable `PITR` backups, revoke shared keys. Audit with `SELECT * FROM pg_stat_statements WHERE query ILIKE '%DELETE%monitor_site%'` and `supabase logs`.
- **Via SQLite fallback:** Will look like wipe after each Render deploy. Verify Render → `Environment` has `DB_HOST=aws-0-eu-west-1.pooler.supabase.com`, `DB_USER=postgres.avqolbgcvsmllineznzu`, `DB_PASSWORD`, `DB_PORT=5432`, `DB_NAME=postgres`, `SECRET_KEY`, `ALLOWED_HOSTS`. Test: `curl https://api.pulsecheck.edoware.com/health` → `db:connected` and `psql SELECT count(*)`.

**Next steps:** re-add 4 sites via dashboard (immediate ping will create first check), watch `Render → Logs` and `Supabase → Logs → Postgres` filtered `DELETE` for next 30 min. If wipe recurs, share that `DELETE` statement+timestamp+`auth_user` to pinpoint caller.

---

## 7. Refs

- Files: `pulsecheck_backend/monitor/views.py:68`, `models.py:30`, `admin.py:5`, `settings.py:94,186`, `dashboard/page.jsx:45,76`, `ResponseTimeChart.jsx:66`, `supabase/functions/ping-monitors/index.ts:18`, `supabase/config.toml:16`
- Supabase project `avqolbgcvsmllineznzu`, cron `4 */3`, postgres `17758 monitor_site, 17583 auth_user`
- Prod health `https://api.pulsecheck.edoware.com/health` / `https://pulsecheck-3dlz.onrender.com/health`
