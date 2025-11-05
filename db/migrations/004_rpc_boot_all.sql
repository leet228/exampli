-- rpc_boot_all: единая агрегирующая функция для boot1 + boot2

create or replace function public.rpc_boot_all(
  p_user_id uuid,
  p_active_id uuid default null,
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
  v_lessons_current_topic jsonb := '[]'::jsonb;
  v_topics_by_subject jsonb := '{}'::jsonb;
  v_lessons_by_topic jsonb := '{}'::jsonb;
  v_subjects_all jsonb := '[]'::jsonb;
  v_chosen_subjects jsonb := '[]'::jsonb;
  v_friends jsonb := '[]'::jsonb;
  v_friends_stats jsonb := '{}'::jsonb;
  v_invites jsonb := '[]'::jsonb;
  v_streak_days_all jsonb := '[]'::jsonb;
  v_last_streak_day text := null;
  v_plus_active boolean := false;
  v_today_msk date := (timezone('Europe/Moscow', now()))::date;
begin
  -- user row
  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object();
  end if;

  -- profile
  select jsonb_build_object(
    'background_color', up.background_color,
    'background_icon', up.background_icon,
    'phone_number', up.phone_number,
    'first_name', up.first_name,
    'username', up.username
  ) into v_profile
  from public.user_profile up
  where up.user_id = p_user_id;

  -- friends_count
  select count(*) into v_friends_count
  from public.friend_links fl
  where fl.status = 'accepted' and (fl.a_id = p_user_id or fl.b_id = p_user_id);

  -- active subject resolve
  v_active_id := coalesce(p_active_id, v_user.added_course);
  if v_active_id is null and p_active_code is not null then
    select s.id into v_active_id from public.subjects s where s.code = p_active_code limit 1;
  end if;
  if v_active_id is not null then
    select jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'level', s.level), s.code
      into v_subject, v_active_code
    from public.subjects s where s.id = v_active_id;
  end if;

  -- lessons for current_topic (boot1 path)
  if v_user.current_topic is not null then
    select coalesce(
      jsonb_agg(jsonb_build_object('id', l.id, 'topic_id', l.topic_id, 'order_index', l.order_index) order by l.order_index),
      '[]'::jsonb
    ) into v_lessons_current_topic
    from public.lessons l
    where l.topic_id = v_user.current_topic
    order by l.order_index asc;
  end if;

  -- plus flag & chosen subjects (only when plus is active)
  v_plus_active := (v_user.plus_until is not null and v_user.plus_until > now());
  if v_plus_active then
    with ids as (
      select cc.subject_id from public.chosen_courses cc where cc.user_id = p_user_id limit 4
    )
    select coalesce(
      jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'level', s.level)),
      '[]'::jsonb
    ) into v_chosen_subjects
    from public.subjects s where s.id in (select subject_id from ids);
  end if;

  -- subjectsAll (boot2)
  select coalesce(
    jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'level', s.level) order by s.level asc, s.title asc),
    '[]'::jsonb
  ) into v_subjects_all
  from public.subjects s;

  -- topicsBySubject & lessonsByTopic for active subject (boot2)
  if v_active_id is not null then
    select jsonb_build_object(
      v_active_id::text,
      coalesce(
        (select jsonb_agg(jsonb_build_object('id', t.id, 'subject_id', t.subject_id, 'title', t.title, 'order_index', t.order_index) order by t.order_index)
         from public.topics t where t.subject_id = v_active_id),
        '[]'::jsonb
      )
    ) into v_topics_by_subject;

    select coalesce(
      jsonb_object_agg(
        t.id::text,
        coalesce(
          (select jsonb_agg(jsonb_build_object('id', l.id, 'topic_id', l.topic_id, 'order_index', l.order_index) order by l.order_index)
           from public.lessons l where l.topic_id = t.id),
          '[]'::jsonb
        )
      ), '{}'
    ) into v_lessons_by_topic
    from public.topics t
    where t.subject_id = v_active_id;
  end if;

  -- invites pending (boot2)
  select coalesce(
    jsonb_agg(jsonb_build_object('from_user_id', fl.a_id::text)), '[]'::jsonb
  ) into v_invites
  from public.friend_links fl
  where fl.status = 'pending' and fl.b_id = p_user_id;

  -- streak days (boot2) + last_streak_day (boot1)
  select coalesce(
    jsonb_agg(jsonb_build_object('day', sd.day::text, 'kind', coalesce(sd.kind, 'active')) order by sd.day),
    '[]'::jsonb
  ) into v_streak_days_all
  from public.streak_days sd
  where sd.user_id = p_user_id;

  select to_char(max(sd.day), 'YYYY-MM-DD') into v_last_streak_day
  from public.streak_days sd
  where sd.user_id = p_user_id and sd.day <= v_today_msk;

  -- friends list enriched + their friends_count + course code/title (boot2)
  with accepted as (
    select case when fl.a_id = p_user_id then fl.b_id else fl.a_id end as fid
    from public.friend_links fl
    where fl.status = 'accepted' and (fl.a_id = p_user_id or fl.b_id = p_user_id)
  ),
  u as (
    select u.id, u.streak, u.coins, u.avatar_url, u.plus_until, u.max_streak, u.perfect_lessons, u.duel_wins, u.added_course
    from public.users u
    where u.id in (select fid from accepted)
  ),
  p as (
    select up.user_id, up.first_name, up.username, up.background_color, up.background_icon
    from public.user_profile up
    where up.user_id in (select fid from accepted)
  ),
  cnt as (
    select id, sum(cnt) as friends_count from (
      select fl.a_id as id, count(*) as cnt from public.friend_links fl where fl.status = 'accepted' group by fl.a_id
      union all
      select fl.b_id as id, count(*) as cnt from public.friend_links fl where fl.status = 'accepted' group by fl.b_id
    ) x group by id
  ),
  subj as (
    select s.id, s.code, s.title from public.subjects s
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
      'coins', coalesce(u.coins, 0),
      'plus_until', u.plus_until,
      'max_streak', coalesce(u.max_streak, 0),
      'perfect_lessons', coalesce(u.perfect_lessons, 0),
      'duel_wins', coalesce(u.duel_wins, 0),
      'added_course', u.added_course,
      'friends_count', coalesce(c.friends_count, 0),
      'course_code', (select s2.code from subj s2 where s2.id = u.added_course),
      'course_title', (select s2.title from subj s2 where s2.id = u.added_course)
    )), '[]'::jsonb)
    into v_friends
  from u
  left join p on p.user_id = u.id
  left join cnt c on c.id = u.id;

  -- friendsStats map (boot2)
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
    -- boot1
    'profile', coalesce(v_profile, '{}'::jsonb),
    'friends_count', v_friends_count,
    'active_id', v_active_id,
    'active_code', v_active_code,
    'subject', case when v_subject is null then 'null'::jsonb else v_subject end,
    'lessons', v_lessons_current_topic,
    'chosen_subjects', v_chosen_subjects,
    'avatar_url', v_user.avatar_url,
    'last_streak_day', v_last_streak_day,
    'stats', jsonb_build_object(
      'streak', coalesce(v_user.streak, 0),
      'energy', coalesce(v_user.energy, 25),
      'coins', coalesce(v_user.coins, 500),
      'plus_until', v_user.plus_until,
      'frosts', coalesce(v_user.frosts, 0)
    ),
    -- boot2
    'friends', v_friends,
    'invites', v_invites,
    'subjectsAll', v_subjects_all,
    'topicsBySubject', v_topics_by_subject,
    'lessonsByTopic', v_lessons_by_topic,
    'streakDaysAll', v_streak_days_all,
    'friendsStats', v_friends_stats
  );
end;
$$;

grant execute on function public.rpc_boot_all(uuid, uuid, text) to anon, authenticated, service_role;


