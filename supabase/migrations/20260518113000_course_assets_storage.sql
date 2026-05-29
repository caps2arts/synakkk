insert into storage.buckets (id, name, public)
values ('course-assets', 'course-assets', false)
on conflict (id) do nothing;

drop policy if exists "Teachers manage course assets" on storage.objects;
create policy "Teachers manage course assets"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'course-assets'
  and exists (
    select 1
    from public.courses c
    where c.id::text = split_part(name, '/', 1)
      and c.teacher_id = auth.uid()
  )
)
with check (
  bucket_id = 'course-assets'
  and exists (
    select 1
    from public.courses c
    where c.id::text = split_part(name, '/', 1)
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "Users read course assets" on storage.objects;
create policy "Users read course assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'course-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.has_course_access((split_part(name, '/', 1))::uuid, auth.uid())
);
