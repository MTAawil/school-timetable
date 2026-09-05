ALTER TABLE "GradeCurriculum"
DROP CONSTRAINT "GradeCurriculum_values_check";

ALTER TABLE "GradeCurriculum"
ADD CONSTRAINT "GradeCurriculum_values_check"
CHECK ("weeklySessions" > 0);

ALTER TABLE "ClassCurriculum"
DROP CONSTRAINT "ClassCurriculum_values_check";

ALTER TABLE "ClassCurriculum"
ADD CONSTRAINT "ClassCurriculum_values_check"
CHECK ("weeklySessions" > 0);
