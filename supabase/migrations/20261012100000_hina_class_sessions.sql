-- Class sessions teachers create, and the codes students use to join them.
-- Independent of HINA_chat_sessions (those rows are the AI conversations inside a class session).

create or replace function public.hina_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and lower(coalesce(role::text, '')) in ('teacher', 'admin')
  );
$$;

revoke all on function public.hina_is_staff() from public;
grant execute on function public.hina_is_staff() to authenticated;

create table if not exists public."HINA_class_sessions" (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  teacher_name text not null default '',
  title text not null,
  description text not null default '',
  join_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hina_class_sessions_code_format check (join_code ~ '^[A-Z0-9]{4,12}$')
);

create unique index if not exists hina_class_sessions_join_code_idx
  on public."HINA_class_sessions" (join_code);

create index if not exists hina_class_sessions_teacher_updated_idx
  on public."HINA_class_sessions" (teacher_id, updated_at desc);

create table if not exists public."HINA_class_session_members" (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public."HINA_class_sessions" (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  student_name text not null default '',
  student_email text not null default '',
  joined_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index if not exists hina_class_session_members_student_idx
  on public."HINA_class_session_members" (student_id, joined_at desc);

create or replace function public.hina_touch_class_session()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hina_class_sessions_touch on public."HINA_class_sessions";
create trigger hina_class_sessions_touch
before update on public."HINA_class_sessions"
for each row
execute function public.hina_touch_class_session();

create or replace function public.hina_join_class_session(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public."HINA_class_sessions"%rowtype;
  v_name text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a session.';
  end if;

  if public.hina_is_staff() then
    raise exception 'Use a student account to join a session.';
  end if;

  select *
  into sess
  from public."HINA_class_sessions"
  where join_code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));

  if not found then
    raise exception 'No session matches that code.';
  end if;

  select
    coalesce(nullif(u.name, ''), split_part(coalesce(au.email, ''), '@', 1), 'Student'),
    coalesce(au.email, '')
  into v_name, v_email
  from auth.users as au
  left join public.users as u on u.id = au.id
  where au.id = auth.uid();

  insert into public."HINA_class_session_members" (
    session_id,
    student_id,
    student_name,
    student_email
  )
  values (sess.id, auth.uid(), coalesce(v_name, 'Student'), coalesce(v_email, ''))
  on conflict (session_id, student_id) do update
    set student_name = excluded.student_name,
        student_email = excluded.student_email;

  return jsonb_build_object(
    'id', sess.id,
    'teacher_id', sess.teacher_id,
    'teacher_name', sess.teacher_name,
    'title', sess.title,
    'description', sess.description,
    'join_code', sess.join_code,
    'created_at', sess.created_at,
    'updated_at', sess.updated_at
  );
end;
$$;

revoke all on function public.hina_join_class_session(text) from public;
grant execute on function public.hina_join_class_session(text) to authenticated;

-- These checks run as the function owner so the two tables do not call each other's policies.
create or replace function public.hina_is_class_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."HINA_class_session_members" as m
    where m.session_id = p_session_id
      and m.student_id = auth.uid()
  );
$$;

create or replace function public.hina_owns_class_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."HINA_class_sessions" as s
    where s.id = p_session_id
      and s.teacher_id = auth.uid()
  );
$$;

revoke all on function public.hina_is_class_member(uuid) from public;
revoke all on function public.hina_owns_class_session(uuid) from public;
grant execute on function public.hina_is_class_member(uuid) to authenticated;
grant execute on function public.hina_owns_class_session(uuid) to authenticated;

alter table public."HINA_class_sessions" enable row level security;
alter table public."HINA_class_session_members" enable row level security;

drop policy if exists "HINA_class_sessions_select" on public."HINA_class_sessions";
create policy "HINA_class_sessions_select"
  on public."HINA_class_sessions"
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.hina_is_class_member(id)
  );

drop policy if exists "HINA_class_sessions_insert" on public."HINA_class_sessions";
create policy "HINA_class_sessions_insert"
  on public."HINA_class_sessions"
  for insert
  to authenticated
  with check (teacher_id = auth.uid() and public.hina_is_staff());

drop policy if exists "HINA_class_sessions_update" on public."HINA_class_sessions";
create policy "HINA_class_sessions_update"
  on public."HINA_class_sessions"
  for update
  to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.hina_is_staff());

drop policy if exists "HINA_class_sessions_delete" on public."HINA_class_sessions";
create policy "HINA_class_sessions_delete"
  on public."HINA_class_sessions"
  for delete
  to authenticated
  using (teacher_id = auth.uid() and public.hina_is_staff());

drop policy if exists "HINA_class_members_select" on public."HINA_class_session_members";
create policy "HINA_class_members_select"
  on public."HINA_class_session_members"
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.hina_owns_class_session(session_id)
  );

drop policy if exists "HINA_class_members_delete" on public."HINA_class_session_members";
create policy "HINA_class_members_delete"
  on public."HINA_class_session_members"
  for delete
  to authenticated
  using (
    student_id = auth.uid()
    or public.hina_owns_class_session(session_id)
  );

grant select, insert, update, delete on public."HINA_class_sessions" to authenticated;
grant select, delete on public."HINA_class_session_members" to authenticated;

notify pgrst, 'reload schema';
