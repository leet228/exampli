-- rpc_boot1: агрегирует минимальные данные для первого рендера

create or replace function public.rpc_boot1(
  p_user_id uuid,
  p_active_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_profile jsonb := '{}'::jsonb;
  v_friends_count int := 0;
  v_active_id uuid := null;
  v_active_code text := null;
  v_subject jsonb := null;
  v_lessons jsonb := '[]'::jsonb;
  v_current_topic uuid := null;
  v_lesson_progress jsonb := '[]'::jsonb;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object(
      'profile', null,
      'friends_count', 0,
      'active_id', null,
      'active_code', null,
      'subject', null,
      'lessons', jsonb_build_array()
    );
  end if;

  select jsonb_build_object(
    'background_color', up.background_color,
    'background_icon', up.background_icon,
    'phone_number', up.phone_number,
    'first_name', up.first_name,
    'username', up.username
  )
  into v_profile
  from public.user_profile up
  where up.user_id = p_user_id;

  select count(*) into v_friends_count
  from public.friend_links fl
  where fl.status = 'accepted' and (fl.a_id = p_user_id or fl.b_id = p_user_id);

  -- resolve active subject
  if v_user.added_course is not null then
    v_active_id := v_user.added_course;
  elsif p_active_code is not null then
    select s.id into v_active_id from public.subjects s where s.code = p_active_code limit 1;
  end if;

  if v_active_id is not null then
    select jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'level', s.level),
           s.code
    into v_subject, v_active_code
    from public.subjects s
    where s.id = v_active_id;
  end if;

  v_current_topic := v_user.current_topic;
  if v_current_topic is not null then
    select coalesce(
      jsonb_agg(jsonb_build_object('id', l.id, 'topic_id', l.topic_id, 'order_index', l.order_index) order by l.order_index),
      '[]'::jsonb
    ) into v_lessons
    from public.lessons l
    where l.topic_id = v_current_topic
    order by l.order_index asc;
  end if;

  if v_active_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'lesson_id', lp.lesson_id,
          'topic_id', lp.topic_id,
          'subject_id', lp.subject_id,
          'completed_at', to_char(lp.completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      ),
      '[]'::jsonb
    ) into v_lesson_progress
    from public.lesson_progress lp
    where lp.user_id = p_user_id
      and lp.subject_id = v_active_id;
  else
    v_lesson_progress := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'profile', coalesce(v_profile, '{}'::jsonb),
    'friends_count', v_friends_count,
    'active_id', v_active_id,
    'active_code', v_active_code,
    'subject', case when v_subject is null then 'null'::jsonb else v_subject end,
    'lessons', v_lessons,
    'lesson_progress', v_lesson_progress
  );
end;
$$;

grant execute on function public.rpc_boot1(uuid, text) to anon, authenticated, service_role;


