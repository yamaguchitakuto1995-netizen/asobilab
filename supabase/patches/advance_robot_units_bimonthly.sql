-- アドバンス（2周）単元を 2・3-x / 4・5-x / 6・7-x … 体系へ移行
-- 実行前に students_next_text_robot.sql で CHECK を更新すること

UPDATE public.students
SET
  next_text_robot = 'アドバンス（2周） / 1周目 / 2・3-1',
  next_text_robot_text = '1周目 / 2・3-1'
WHERE next_text_robot_course = 'アドバンス（2周）'
  AND next_text_robot IS NOT NULL
  AND next_text_robot NOT LIKE '% / 2・3-%'
  AND next_text_robot NOT LIKE '% / 4・5-%'
  AND next_text_robot NOT LIKE '% / 6・7-%'
  AND next_text_robot NOT LIKE '% / 8・9-%'
  AND next_text_robot NOT LIKE '% / 10・11-%'
  AND next_text_robot NOT LIKE '% / 12・1-%'
  AND next_text_robot NOT LIKE '% / SU1'
  AND next_text_robot NOT LIKE '% / SU2';

UPDATE public.students
SET
  next_text_robot = 'アドバンス（2周） / 2周目 / 2・3-1',
  next_text_robot_text = '2周目 / 2・3-1'
WHERE next_text_robot_course = 'アドバンス（2周）'
  AND next_text_robot_text LIKE '2周目 /%'
  AND next_text_robot NOT LIKE '% / 2・3-%'
  AND next_text_robot NOT LIKE '% / 4・5-%'
  AND next_text_robot NOT LIKE '% / 6・7-%'
  AND next_text_robot NOT LIKE '% / 8・9-%'
  AND next_text_robot NOT LIKE '% / 10・11-%'
  AND next_text_robot NOT LIKE '% / 12・1-%';
