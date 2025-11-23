-- Track which lessons were completed by which users to control lesson availability

create table if not exists public.lesson_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_progress_user_topic_idx
  on public.lesson_progress(user_id, topic_id);

create index if not exists lesson_progress_user_subject_idx
  on public.lesson_progress(user_id, subject_id);

comment on table public.lesson_progress is 'Per-user lesson completion log used for locking/unlocking lessons.';

