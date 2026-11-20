-- ===== 更新 5：電影院（影片作品） =====
-- Supabase → SQL Editor → New query → 貼上 → Run
alter table artworks drop constraint if exists artworks_kind_check;
alter table artworks add constraint artworks_kind_check check (kind in ('flat','photos','model','video'));
alter table artworks add column if not exists video_path text;     -- 影片檔
alter table artworks add column if not exists duration real;       -- 片長（秒）
