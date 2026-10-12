-- Fresh Hina Tutor chat storage.
-- These tables are independent of ai_tutor_chat_notes, ai_tutor_new_sessions,
-- and ai_tutor_new_messages. Those older tables are not read or written by this migration.

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

create table if not exists public."HINA_chat_sessions" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owner_role text not null default 'student',
  course_id text,
  title text not null default 'AI Learning Session',
  message_count integer not null default 0,
  last_preview text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."HINA_chat_messages" (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public."HINA_chat_sessions" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_message_id text,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  turn_number integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, client_message_id)
);

create index if not exists hina_chat_sessions_user_updated_idx
  on public."HINA_chat_sessions" (user_id, updated_at desc);

create index if not exists hina_chat_sessions_course_idx
  on public."HINA_chat_sessions" (course_id);

create index if not exists hina_chat_sessions_updated_idx
  on public."HINA_chat_sessions" (updated_at desc);

create index if not exists hina_chat_messages_session_turn_idx
  on public."HINA_chat_messages" (session_id, turn_number, created_at);

create or replace function public.hina_refresh_chat_session_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.session_id, old.session_id);
  update public."HINA_chat_sessions" as s
  set
    message_count = (
      select count(*)
      from public."HINA_chat_messages" as m
      where m.session_id = sid
    ),
    last_preview = (
      select left(regexp_replace(m.content, '\s+', ' ', 'g'), 180)
      from public."HINA_chat_messages" as m
      where m.session_id = sid
      order by m.turn_number desc, m.created_at desc
      limit 1
    ),
    updated_at = now()
  where s.id = sid;
  return null;
end;
$$;

drop trigger if exists hina_chat_messages_refresh on public."HINA_chat_messages";
create trigger hina_chat_messages_refresh
after insert or update or delete
on public."HINA_chat_messages"
for each row
execute function public.hina_refresh_chat_session_stats();

alter table public."HINA_chat_sessions" enable row level security;
alter table public."HINA_chat_messages" enable row level security;

drop policy if exists "HINA_sessions_select" on public."HINA_chat_sessions";
create policy "HINA_sessions_select"
  on public."HINA_chat_sessions"
  for select
  to authenticated
  using (auth.uid() = user_id or public.hina_is_staff());

drop policy if exists "HINA_sessions_insert" on public."HINA_chat_sessions";
create policy "HINA_sessions_insert"
  on public."HINA_chat_sessions"
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "HINA_sessions_update" on public."HINA_chat_sessions";
create policy "HINA_sessions_update"
  on public."HINA_chat_sessions"
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "HINA_sessions_delete" on public."HINA_chat_sessions";
create policy "HINA_sessions_delete"
  on public."HINA_chat_sessions"
  for delete
  to authenticated
  using (auth.uid() = user_id or public.hina_is_staff());

drop policy if exists "HINA_messages_select" on public."HINA_chat_messages";
create policy "HINA_messages_select"
  on public."HINA_chat_messages"
  for select
  to authenticated
  using (auth.uid() = user_id or public.hina_is_staff());

drop policy if exists "HINA_messages_insert" on public."HINA_chat_messages";
create policy "HINA_messages_insert"
  on public."HINA_chat_messages"
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public."HINA_chat_sessions" as s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "HINA_messages_update" on public."HINA_chat_messages";
create policy "HINA_messages_update"
  on public."HINA_chat_messages"
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public."HINA_chat_sessions" as s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "HINA_messages_delete" on public."HINA_chat_messages";
create policy "HINA_messages_delete"
  on public."HINA_chat_messages"
  for delete
  to authenticated
  using (auth.uid() = user_id or public.hina_is_staff());

grant select, insert, update, delete on public."HINA_chat_sessions" to authenticated;
grant select, insert, update, delete on public."HINA_chat_messages" to authenticated;

notify pgrst, 'reload schema';
