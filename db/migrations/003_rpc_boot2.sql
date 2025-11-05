-- rpc_boot2: агрегирует второстепенные/тяжёлые данные в один ответ

create or replace function public.rpc_boot2(
  p_user_id uuid,
  p_active_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friends jsonb := '[]'::jsonb;
  v_invites jsonb := '[]'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
  v_topics_by_subject jsonb := '{}'::jsonb;
  v_lessons_by_topic jsonb := '{}'::jsonb;
  v_streak_days jsonb := '[]'::jsonb;
  v_friends_stats jsonb := '{}'::jsonb;
begin
  -- friends list (accepted)
  with f as (
    select case when fl.a_id = p_user_id then fl.b_id else fl.a_id end as fid
    from public.friend_links fl
    where fl.status = 'accepted' and (fl.a_id = p_user_id or fl.b_id = p_user_id)
  ), u as (
    select u.id, u.streak, u.coins, u.avatar_url, u.plus_until, u.max_streak, u.perfect_lessons, u.duel_wins, u.added_course
    from public.users u
    where u.id in (select fid from f)
  ), p as (
    select up.user_id, up.first_name, up.username, up.background_color, up.background_icon
    from public.user_profile up
    where up.user_id in (select fid from f)
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', u.id::text,
      'first_name', p.first_name,
      'username', p.username,
      'background_color', p.background_color,
      'background_icon', p.background_icon,
      'avatar_url', u.avatar_url,
      'streak', coalesce(u.streak, 0),
      'coins', coalesce(u.coins, 0)
    )),
    '[]'::jsonb
  )
  into v_friends
  from u left join p on p.user_id = u.id;

  -- invites (pending to me)
  select coalesce(
    jsonb_agg(jsonb_build_object('from_user_id', fl.a_id::text)), '[]'::jsonb
  ) into v_invites
  from public.friend_links fl
  where fl.status = 'pending' and fl.b_id = p_user_id;

  -- subjectsAll
  select coalesce(
    jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'level', s.level) order by s.level asc, s.title asc),
    '[]'::jsonb
  )
  into v_subjects
  from public.subjects s;

  -- topicsBySubject (only active to keep payload small)
  if p_active_id is not null then
    select jsonb_build_object(
      p_active_id::text,
      coalesce(
        (select jsonb_agg(jsonb_build_object('id', t.id, 'subject_id', t.subject_id, 'title', t.title, 'order_index', t.order_index) order by t.order_index)
         from public.topics t where t.subject_id = p_active_id),
        '[]'::jsonb
      )
    ) into v_topics_by_subject;
  else
    v_topics_by_subject := '{}'::jsonb;
  end if;

  -- lessonsByTopic (for all topics of active subject)
  if p_active_id is not null then
    select coalesce(
      jsonb_object_agg(
        t.id::text,
        coalesce(
          (select jsonb_agg(jsonb_build_object('id', l.id, 'topic_id', l.topic_id, 'order_index', l.order_index) order by l.order_index)
           from public.lessons l where l.topic_id = t.id),
          '[]'::jsonb
        )
      ), '{}'
    )
    into v_lessons_by_topic
    from public.topics t
    where t.subject_id = p_active_id;
  end if;

  -- streakDaysAll
  select coalesce(
    jsonb_agg(jsonb_build_object('day', sd.day::text, 'kind', coalesce(sd.kind, 'active')) order by sd.day),
    '[]'::jsonb
  ) into v_streak_days
  from public.streak_days sd
  where sd.user_id = p_user_id;

  -- friendsStats map
  select coalesce(
    jsonb_object_agg(u.id::text, jsonb_build_object(
      'streak', coalesce(u.streak, 0),
      'coins', coalesce(u.coins, 0),
      'avatar_url', u.avatar_url,
      'plus_until', u.plus_until,
      'max_streak', coalesce(u.max_streak, 0),
      'perfect_lessons', coalesce(u.perfect_lessons, 0),
      'duel_wins', coalesce(u.duel_wins, 0),
      'added_course', u.added_course
    )), '{}'::jsonb)
  into v_friends_stats
  from public.users u
  where u.id in (
    select case when fl.a_id = p_user_id then fl.b_id else fl.a_id end
    from public.friend_links fl
    where fl.status = 'accepted' and (fl.a_id = p_user_id or fl.b_id = p_user_id)
  );

  return jsonb_build_object(
    'friends', v_friends,
    'invites', v_invites,
    'subjectsAll', v_subjects,
    'topicsBySubject', v_topics_by_subject,
    'lessonsByTopic', v_lessons_by_topic,
    'streakDaysAll', v_streak_days,
    'friendsStats', v_friends_stats
  );
end;
$$;

grant execute on function public.rpc_boot2(uuid, uuid) to anon, authenticated, service_role;


