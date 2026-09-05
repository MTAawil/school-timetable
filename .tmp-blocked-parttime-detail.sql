select
  cs."shortCode" as class,
  cs.grade,
  s.name as subject,
  cc."weeklySessions",
  cc."isMainSubject",
  cc."allowDoubleSession",
  t.name as teacher,
  t."weeklyTeachingSessions"
from "ClassCurriculum" cc
join "ClassSection" cs on cs.id = cc."classSectionId"
join "Subject" s on s.id = cc."subjectId"
join "Teacher" t on t.id = cc."teacherId"
where cs."shortCode" in ('10A', '10B', 'ES1')
  and t."employmentType" = 'PART_TIME'
  and cc."isActive" = true
order by cs."shortCode", cc."weeklySessions" desc, s.name;

select
  t.name as teacher,
  cs."shortCode" as class,
  cs.grade,
  s.name as subject,
  cc."weeklySessions",
  cc."isMainSubject",
  cc."allowDoubleSession"
from "ClassCurriculum" cc
join "ClassSection" cs on cs.id = cc."classSectionId"
join "Subject" s on s.id = cc."subjectId"
join "Teacher" t on t.id = cc."teacherId"
where t.name in ('صبحي حمية', 'محمد عساف')
  and cc."isActive" = true
order by t.name, cs."shortCode", s.name;
