-- ===== 學生作品畫廊：Supabase 一次過設定 =====
-- 用法：Supabase → SQL Editor → New query → 將成個檔案貼入去 → Run
-- 第一個登入嘅老師會自動成為「管理員」，可以批准其他老師。

create extension if not exists pgcrypto;

-- ---------- 1. 老師 ----------
create table if not exists teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  approved boolean not null default false,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value text
);

create or replace function is_teacher() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where id = auth.uid() and approved);
$$;
create or replace function is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where id = auth.uid() and approved and is_owner);
$$;

-- 新帳戶登入時自動建立老師紀錄
create or replace function handle_new_teacher() returns trigger language plpgsql security definer set search_path = public as $$
declare is_first boolean; dom text;
begin
  select not exists (select 1 from teachers) into is_first;
  select lower(value) into dom from settings where key = 'allowed_domain';
  insert into teachers (id, email, name, approved, is_owner)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          is_first or (dom is not null and dom <> '' and lower(split_part(new.email, '@', 2)) = dom),
          is_first)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_teacher();

-- ---------- 2. 畫廊資料 ----------
create table if not exists galleries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references teachers(id) on delete cascade,
  title text not null,
  edition text,
  subtitle text,
  grade text not null default '4',          -- '1'..'6' 或者 'all'（全校）
  theme text not null default 'minimal',
  colors jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table galleries add column if not exists room_size int not null default 20;   -- 每間展室最多幾多件作品（0 = 唔分房）
alter table galleries add column if not exists light jsonb not null default '{}'::jsonb; -- 陽光設定

create table if not exists halls (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  name text not null,
  sort int not null default 0
);

create table if not exists artworks (
  id uuid primary key default gen_random_uuid(),
  hall_id uuid not null references halls(id) on delete cascade,
  kind text not null default 'flat' check (kind in ('flat','photos','model')),
  student_class text,
  student_no int,
  student_name text,
  title text,
  image_path text,
  photo_paths text[] not null default '{}',
  model_path text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table artworks add column if not exists thumb_path text;   -- 展廳用嘅細預覽圖

create table if not exists students (
  owner_id uuid not null default auth.uid() references teachers(id) on delete cascade,
  class_name text not null,
  number int not null,
  name text not null,
  primary key (owner_id, class_name, number)
);

create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references teachers(id) on delete cascade,
  code text not null unique,
  label text,
  grades text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks(id) on delete cascade,
  sticker text not null check (sticker in ('love','wow','idea','cool','giggle','touched','yum','curious','shy','peek')),
  phrase text not null check (phrase in (
    '我好鍾意你用嘅顏色！','構圖好特別！','好有創意！','畫得好細心！','線條好靚！',
    '好有想像力！','睇得出你好用心！','好有你自己嘅風格！','主題表達得好清楚！','我想學你咁畫！')),
  from_class text not null check (char_length(from_class) <= 10),
  from_no text not null check (char_length(from_no) <= 20),
  from_name text not null check (char_length(from_name) <= 20),
  created_at timestamptz not null default now(),
  unique (artwork_id, from_class, from_no)
);

create index if not exists halls_gallery_idx on halls(gallery_id);
create index if not exists artworks_hall_idx on artworks(hall_id);
create index if not exists reactions_artwork_idx on reactions(artwork_id);

-- 擁有權檢查
create or replace function can_edit_gallery(gid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_teacher() and exists (select 1 from galleries g where g.id = gid and (g.owner_id = auth.uid() or is_owner()));
$$;
create or replace function can_edit_hall(hid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from halls h where h.id = hid and can_edit_gallery(h.gallery_id));
$$;
create or replace function can_edit_artwork(aid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from artworks a where a.id = aid and can_edit_hall(a.hall_id));
$$;

-- ---------- 3. 權限（學生唔可以直接讀資料表，一定要經連結） ----------
alter table teachers  enable row level security;
alter table settings  enable row level security;
alter table galleries enable row level security;
alter table halls     enable row level security;
alter table artworks  enable row level security;
alter table students  enable row level security;
alter table links     enable row level security;
alter table reactions enable row level security;

drop policy if exists "teachers read" on teachers;     create policy "teachers read" on teachers for select using (id = auth.uid() or is_owner() or (is_teacher() and approved));
drop policy if exists "teachers owner" on teachers;    create policy "teachers owner" on teachers for update using (is_owner()) with check (is_owner());
drop policy if exists "settings owner" on settings;    create policy "settings owner" on settings for all using (is_owner()) with check (is_owner());

drop policy if exists "galleries rw" on galleries;
create policy "galleries rw" on galleries for all
  using (is_teacher() and (owner_id = auth.uid() or is_owner()))
  with check (is_teacher() and (owner_id = auth.uid() or is_owner()));
drop policy if exists "halls rw" on halls;             create policy "halls rw" on halls for all using (can_edit_gallery(gallery_id)) with check (can_edit_gallery(gallery_id));
drop policy if exists "artworks rw" on artworks;       create policy "artworks rw" on artworks for all using (can_edit_hall(hall_id)) with check (can_edit_hall(hall_id));
drop policy if exists "students rw" on students;       create policy "students rw" on students for all using (is_teacher() and owner_id = auth.uid()) with check (is_teacher() and owner_id = auth.uid());
drop policy if exists "links rw" on links;             create policy "links rw" on links for all using (is_teacher() and owner_id = auth.uid()) with check (is_teacher() and owner_id = auth.uid());
drop policy if exists "reactions read" on reactions;   create policy "reactions read" on reactions for select using (can_edit_artwork(artwork_id));
drop policy if exists "reactions add" on reactions;    create policy "reactions add" on reactions for insert with check (can_edit_artwork(artwork_id));
drop policy if exists "reactions del" on reactions;    create policy "reactions del" on reactions for delete using (can_edit_artwork(artwork_id));

-- ---------- 4. 學生用嘅功能（經連結代碼） ----------
create or replace function _link(p_code text) returns links language sql stable security definer set search_path = public as $$
  select * from links where code = p_code and active limit 1;
$$;
create or replace function _visible(l links, g galleries) returns boolean language sql immutable as $$
  select l.id is not null and g.owner_id = l.owner_id and (g.grade = 'all' or g.grade = any(l.grades));
$$;

create or replace function link_info(p_code text) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('code', l.code, 'label', l.label, 'grades', l.grades, 'teacher_name', t.name)
  from links l join teachers t on t.id = l.owner_id where l.code = p_code and l.active;
$$;

create or replace function link_galleries(p_code text) returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.sort, x.created_at desc), '[]'::json) from (
    select g.id, g.title, g.edition, g.subtitle, g.grade, g.theme, g.colors, g.sort, g.created_at,
      (select coalesce(json_agg(json_build_object('id', h.id, 'name', h.name, 'sort', h.sort,
          'count', (select count(*) from artworks a where a.hall_id = h.id)) order by h.sort), '[]'::json)
       from halls h where h.gallery_id = g.id) as halls
    from galleries g where _visible(_link(p_code), g)
  ) x;
$$;

create or replace function link_gallery(p_code text, p_gallery uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'gallery', to_json(g),
    'halls', (select coalesce(json_agg(h order by h.sort), '[]'::json) from halls h where h.gallery_id = g.id),
    'artworks', (select coalesce(json_agg(a order by a.sort, a.created_at), '[]'::json) from artworks a join halls h on h.id = a.hall_id where h.gallery_id = g.id))
  from galleries g where g.id = p_gallery and _visible(_link(p_code), g);
$$;

create or replace function link_reactions(p_code text, p_ids uuid[]) returns setof reactions language sql stable security definer set search_path = public as $$
  select r.* from reactions r join artworks a on a.id = r.artwork_id join halls h on h.id = a.hall_id join galleries g on g.id = h.gallery_id
  where r.artwork_id = any(p_ids) and _visible(_link(p_code), g);
$$;

create or replace function link_add_reaction(p_code text, p_artwork uuid, p_sticker text, p_phrase text, p_from_class text, p_from_no text, p_from_name text)
returns reactions language plpgsql security definer set search_path = public as $$
declare r reactions;
begin
  if not exists (select 1 from artworks a join halls h on h.id = a.hall_id join galleries g on g.id = h.gallery_id where a.id = p_artwork and _visible(_link(p_code), g)) then
    raise exception '呢件作品冇開放俾呢條連結';
  end if;
  insert into reactions (artwork_id, sticker, phrase, from_class, from_no, from_name)
  values (p_artwork, p_sticker, p_phrase, left(p_from_class, 10), left(p_from_no, 20), left(p_from_name, 20)) returning * into r;
  return r;
end $$;

create or replace function link_lookup_student(p_code text, p_class text, p_no int) returns text language sql stable security definer set search_path = public as $$
  select s.name from students s, _link(p_code) l where l.id is not null and s.owner_id = l.owner_id and s.class_name = p_class and s.number = p_no;
$$;

create or replace function link_classes(p_code text) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s.class_name order by s.class_name), '{}') from students s, _link(p_code) l
  where l.id is not null and s.owner_id = l.owner_id and (left(s.class_name, 1) !~ '[0-9]' or left(s.class_name, 1) = any(l.grades));
$$;

grant execute on function link_info, link_galleries, link_gallery, link_reactions, link_add_reaction, link_lookup_student, link_classes to anon, authenticated;
revoke execute on function _link from public, anon;

-- ---------- 5. 存相同 3D 檔（公開睇，老師只可以改自己資料夾） ----------
insert into storage.buckets (id, name, public, file_size_limit) values ('artworks', 'artworks', true, 52428800)
  on conflict (id) do update set public = true;

drop policy if exists "teacher upload" on storage.objects;
create policy "teacher upload" on storage.objects for insert
  with check (bucket_id = 'artworks' and is_teacher() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "teacher update" on storage.objects;
create policy "teacher update" on storage.objects for update
  using (bucket_id = 'artworks' and is_teacher() and ((storage.foldername(name))[1] = auth.uid()::text or is_owner()));
drop policy if exists "teacher delete" on storage.objects;
create policy "teacher delete" on storage.objects for delete
  using (bucket_id = 'artworks' and is_teacher() and ((storage.foldername(name))[1] = auth.uid()::text or is_owner()));

-- ---------- 6. 儲存空間顯示 ----------
create or replace function storage_usage() returns json language sql stable security definer set search_path = public, storage as $$
  select case when not is_teacher() then null else json_build_object(
    'total_bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
    'my_bytes', coalesce(sum((o.metadata->>'size')::bigint) filter (where (storage.foldername(o.name))[1] = auth.uid()::text), 0),
    'files', count(*))
  end
  from storage.objects o where o.bucket_id = 'artworks';
$$;
grant execute on function storage_usage() to authenticated;
