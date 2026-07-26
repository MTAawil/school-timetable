export const softConstraints = [
  {
    code: "TEACHER_AVAILABILITY",
    label: "Teacher slot preference",
    description: "Avoid disliked slots and prefer explicitly preferred slots.",
    defaultWeight: 20,
  },
  {
    code: "FIRST_LAST_PERIOD",
    label: "First and last periods",
    description: "Reduce lessons at the edges of the teaching day.",
    defaultWeight: 2,
  },
  {
    code: "TEACHER_GAP",
    label: "Teacher gaps",
    description:
      "Reduce empty teaching periods inside a teacher's working day.",
    defaultWeight: 12,
  },
  {
    code: "PART_TIME_COMPACTNESS",
    label: "Part-time compactness",
    description:
      "Apply an additional cost to internal gaps for part-time staff.",
    defaultWeight: 10,
  },
  {
    code: "TEACHER_CONSECUTIVE_PREFERENCE",
    label: "Compact lesson blocks",
    description: "Prefer fewer separate teaching blocks during each day.",
    defaultWeight: 3,
  },
  {
    code: "SUBJECT_SPREAD",
    label: "Subject spread",
    description: "Spread repeated class-subject sessions across more days.",
    defaultWeight: 10,
  },
  {
    code: "REPEATED_SUBJECT_DAY",
    label: "Repeated subject in one day",
    description:
      "Penalize additional occurrences of a subject on the same day.",
    defaultWeight: 8,
  },
  {
    code: "LATE_HEAVY_SUBJECT",
    label: "Subject time preference",
    description:
      "Honor early or late time-band preferences configured on subjects.",
    defaultWeight: 4,
  },
  {
    code: "DAILY_WORKLOAD_BALANCE",
    label: "Daily workload balance",
    description: "Reduce large differences in a teacher's daily lesson count.",
    defaultWeight: 2,
  },
] as const;
