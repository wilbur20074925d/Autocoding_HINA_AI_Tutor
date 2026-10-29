-- Login profiles live in HINA_users.
-- Existing public.users rows are copied here. public.users is not updated or deleted.

create table if not exists public."HINA_users" (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text,
  role text not null default 'student',
  avatar_url text,
  enrolled_course_ids text[] not null default '{}',
  twofa_secret text,
  twofa_enabled boolean not null default false,
  twofa_enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hina_users_role_idx
  on public."HINA_users" (lower(role));

create or replace function public.hina_copy_legacy_users()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.users') is null then
    return;
  end if;

  insert into public."HINA_users" (
    id,
    name,
    email,
    role,
    avatar_url,
    enrolled_course_ids,
    twofa_secret,
    twofa_enabled,
    twofa_enrolled_at,
    created_at,
    updated_at
  )
  select
    u.id,
    coalesce(payload->>'name', ''),
    nullif(payload->>'email', ''),
    coalesce(nullif(payload->>'role', ''), 'student'),
    nullif(payload->>'avatar_url', ''),
    case
      when jsonb_typeof(payload->'enrolled_course_ids') = 'array' then (
        select coalesce(array_agg(item), '{}'::text[])
        from jsonb_array_elements_text(payload->'enrolled_course_ids') as item
      )
      else '{}'::text[]
    end,
    nullif(payload->>'twofa_secret', ''),
    coalesce((payload->>'twofa_enabled')::boolean, false),
    nullif(payload->>'twofa_enrolled_at', '')::timestamptz,
    coalesce(nullif(payload->>'created_at', '')::timestamptz, now()),
    coalesce(nullif(payload->>'updated_at', '')::timestamptz, now())
  from (
    select users.id, to_jsonb(users) as payload
    from public.users as users
  ) as u
  on conflict (id) do nothing;
end;
$$;

select public.hina_copy_legacy_users();

-- New rows added to the old table are copied forward.
-- Updates stay on public.users so the login table is not overwritten later.
create or replace function public.hina_mirror_legacy_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb := to_jsonb(new);
begin
  insert into public."HINA_users" (
    id,
    name,
    email,
    role,
    avatar_url,
    enrolled_course_ids,
    twofa_secret,
    twofa_enabled,
    twofa_enrolled_at,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(payload->>'name', ''),
    nullif(payload->>'email', ''),
    coalesce(nullif(payload->>'role', ''), 'student'),
    nullif(payload->>'avatar_url', ''),
    case
      when jsonb_typeof(payload->'enrolled_course_ids') = 'array' then (
        select coalesce(array_agg(item), '{}'::text[])
        from jsonb_array_elements_text(payload->'enrolled_course_ids') as item
      )
      else '{}'::text[]
    end,
    nullif(payload->>'twofa_secret', ''),
    coalesce((payload->>'twofa_enabled')::boolean, false),
    nullif(payload->>'twofa_enrolled_at', '')::timestamptz,
    coalesce(nullif(payload->>'created_at', '')::timestamptz, now()),
    coalesce(nullif(payload->>'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.users') is null then
    return;
  end if;

  drop trigger if exists hina_mirror_legacy_user on public.users;
  create trigger hina_mirror_legacy_user
  after insert on public.users
  for each row
  execute function public.hina_mirror_legacy_user();
end;
$$;

create or replace function public.hina_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."HINA_users"
    where id = auth.uid()
      and lower(coalesce(role, '')) in ('teacher', 'admin')
  )
  or exists (
    select 1
    from public.users
    where id = auth.uid()
      and lower(coalesce(role::text, '')) in ('teacher', 'admin')
  );
$$;

revoke all on function public.hina_is_staff() from public;
grant execute on function public.hina_is_staff() to authenticated;

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
    coalesce(
      nullif(h.name, ''),
      nullif(u.name, ''),
      split_part(coalesce(au.email, ''), '@', 1),
      'Student'
    ),
    coalesce(nullif(h.email, ''), au.email, '')
  into v_name, v_email
  from auth.users as au
  left join public."HINA_users" as h on h.id = au.id
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

alter table public."HINA_users" enable row level security;

drop policy if exists "HINA_users_select" on public."HINA_users";
create policy "HINA_users_select"
  on public."HINA_users"
  for select
  to authenticated
  using (true);

drop policy if exists "HINA_users_insert" on public."HINA_users";
create policy "HINA_users_insert"
  on public."HINA_users"
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "HINA_users_update" on public."HINA_users";
create policy "HINA_users_update"
  on public."HINA_users"
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on public."HINA_users" to authenticated;

notify pgrst, 'reload schema';
