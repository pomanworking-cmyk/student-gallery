-- ===== 更新 4：錄音導賞＋參觀紀錄 =====
-- Supabase → SQL Editor → New query → 貼上 → Run
alter table artworks add column if not exists audio_path text;   -- 作品錄音介紹

create table if not exists visits (
  artwork_id uuid not null references artworks(id) on delete cascade,
  visitor_class text not null check (char_length(visitor_class) <= 10),
  visitor_no text not null check (char_length(visitor_no) <= 20),
  visitor_name text not null check (char_length(visitor_name) <= 20),
  created_at timestamptz not null default now(),
  primary key (artwork_id, visitor_class, visitor_no)
);
alter table visits enable row level security;
drop policy if exists "visits read" on visits;  create policy "visits read" on visits for select using (can_edit_artwork(artwork_id));
drop policy if exists "visits del" on visits;   create policy "visits del" on visits for delete using (can_edit_artwork(artwork_id));

-- 學生睇過一件作品（經連結）
create or replace function link_mark_seen(p_code text, p_artwork uuid, p_class text, p_no text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from artworks a join halls h on h.id = a.hall_id join galleries g on g.id = h.gallery_id where a.id = p_artwork and _visible(_link(p_code), g)) then
    raise exception '呢件作品冇開放俾呢條連結';
  end if;
  insert into visits (artwork_id, visitor_class, visitor_no, visitor_name)
  values (p_artwork, left(p_class, 10), left(p_no, 20), left(p_name, 20))
  on conflict (artwork_id, visitor_class, visitor_no) do nothing;
end $$;

-- 學生自己喺呢個畫廊睇過邊幾件
create or replace function link_my_seen(p_code text, p_gallery uuid, p_class text, p_no text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(v.artwork_id), '{}') from visits v
  join artworks a on a.id = v.artwork_id join halls h on h.id = a.hall_id join galleries g on g.id = h.gallery_id
  where g.id = p_gallery and _visible(_link(p_code), g) and v.visitor_class = p_class and v.visitor_no = p_no;
$$;

grant execute on function link_mark_seen, link_my_seen to anon, authenticated;
