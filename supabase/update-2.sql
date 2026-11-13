-- ===== 更新 2：相連展室＋陽光模式 =====
-- 如果你之前已經 Run 過 setup.sql，只需要 Run 呢幾行（Supabase → SQL Editor → New query → 貼上 → Run）
alter table galleries add column if not exists room_size int not null default 20;
alter table galleries add column if not exists light jsonb not null default '{}'::jsonb;
alter table artworks  add column if not exists thumb_path text;
