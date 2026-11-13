-- ===== 更新 3：儲存空間顯示 =====
-- Supabase → SQL Editor → New query → 貼上 → Run
create or replace function storage_usage() returns json language sql stable security definer set search_path = public, storage as $$
  select case when not is_teacher() then null else json_build_object(
    'total_bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
    'my_bytes', coalesce(sum((o.metadata->>'size')::bigint) filter (where (storage.foldername(o.name))[1] = auth.uid()::text), 0),
    'files', count(*))
  end
  from storage.objects o where o.bucket_id = 'artworks';
$$;
grant execute on function storage_usage() to authenticated;
