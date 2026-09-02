import { hash } from "bcryptjs";

import {
  buildSchoolPeriods,
  getDatabase,
} from "../packages/database/src/index";

type TeacherDetail = {
  teacher: string;
  subject: string;
  className: string;
  hours: number;
  sourceRow: number;
};

type SharedTeachingCombination = {
  teacher: string;
  subject: string;
  anchorClassName: string;
  sharedClassNames: string[];
  hours: number;
  sourceRow: number;
};

type SeedSharedCurriculum = {
  id: string;
  classSectionId: string;
  teacherId: string | null;
  weeklySessions: number;
  sharedTeachingGroupId: string | null;
};

const ids = {
  school: "00000000-0000-4000-8000-000000000001",
  term: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000003",
  profile: "00000000-0000-4000-8000-000000000004",
} as const;

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type DayName = (typeof days)[number];

const schoolWeekConfiguration = {
  workingDayCount: 5,
  sessionsPerDay: 6,
  sessionDurationMinutes: 55,
  firstSessionStartMinutes: 7 * 60 + 30,
  breakAfterSession: 3,
  breakDurationMinutes: 30,
} as const;

const partTimeAvailabilityByTeacher = {
  "علي بندر": {
    Tuesday: [1, 2, 3, 4],
    Thursday: [5, 6],
    Friday: [1, 2, 3, 4],
  },
  "محمد عساف": {
    Monday: [2, 3, 4, 5, 6],
    Tuesday: [2, 3, 4, 5, 6],
    Wednesday: [2, 3, 4, 5],
  },
  "حسن يزبك": {
    Monday: [5, 6],
    Tuesday: [1, 2, 3],
    Wednesday: [2, 3, 4],
    Thursday: [3, 4],
  },
  "ناجي هاشم": {
    Monday: [1, 2, 3],
    Tuesday: [1, 2, 3],
    Thursday: [1, 2, 3],
  },
  "رباب العبد": {
    Monday: [1, 2, 3, 4, 5, 6],
    Tuesday: [1, 2, 3, 4, 5, 6],
    Thursday: [1, 2, 3, 4, 5, 6],
  },
  "رؤى الحاج حسن": {
    Monday: [1, 2, 3, 4, 5, 6],
    Wednesday: [1, 2, 3, 4, 5, 6],
    Friday: [1, 2, 3, 4, 5, 6],
  },
  "صبحي حمية": {
    Monday: [1, 2, 3, 4, 5, 6],
    Wednesday: [1, 2, 3, 4, 5, 6],
    Friday: [1, 2, 3, 4],
  },
  "سحر فقيه": {
    Monday: [1, 2, 3, 4, 5, 6],
    Tuesday: [1, 2, 3, 4, 5, 6],
    Thursday: [1, 2, 3, 4, 5, 6],
    Friday: [1, 2, 3],
  },
  "منى وهبي": {
    Monday: [1, 2, 3, 4, 5, 6],
    Tuesday: [1, 2, 3, 4, 5, 6],
    Friday: [1, 2, 3, 4],
  },
  "محمد عبدو": {
    Wednesday: [1, 2, 3, 4, 5, 6],
    Friday: [1, 2, 3, 4, 5, 6],
  },
  "محمد جقمرة": {
    Monday: [1, 2, 3, 4],
    Tuesday: [1, 2, 3, 4],
    Wednesday: [1, 2, 3, 4],
    Thursday: [1, 2, 3, 4],
    Friday: [1, 2, 3, 4],
  },
  "حسن ناجي": {
    Monday: [1, 2, 3, 4, 5],
    Wednesday: [1, 2, 3, 4, 5],
    Friday: [1, 2, 3],
  },
  "ريما عيسى": {
    Friday: [1, 2, 3, 4, 5, 6],
  },
} satisfies Record<string, Partial<Record<DayName, readonly number[]>>>;

const seededUnavailableSessionsByTeacher = {
  "عادل رزق": [3, 4],
  "نزيه طي": [3, 4],
} satisfies Record<string, readonly number[]>;

const gradesSevenToTwelveClasses = [
  "SE",
  "ES",
  "SV",
  "LS",
  "ES2",
  "11B",
  "11A",
  "ES1",
  "10B",
  "10A",
  "EB9",
  "9B",
  "9A",
  "EB8",
  "8B",
  "8A",
  "EB7",
  "7B",
  "7A",
] as const;

const gradesOneToSixClasses = [
  "EB6",
  "6C",
  "6B",
  "6A",
  "EB5",
  "5C",
  "5B",
  "5A",
  "EB4",
  "4C",
  "4B",
  "4A",
  "EB3",
  "3B",
  "3A",
  "EB2",
  "2B",
  "2A",
  "EB1",
  "1B",
  "1A",
] as const;

const teacherDetails: TeacherDetail[] = [
  {
    teacher: "احمد الحركة",
    subject: "دين",
    className: "ES 1",
    hours: 1,
    sourceRow: 105,
  },
  {
    teacher: "احمد الحركة",
    subject: "دين",
    className: "ES 2",
    hours: 1,
    sourceRow: 16,
  },
  {
    teacher: "احمد الحركة",
    subject: "دين",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 137,
  },
  {
    teacher: "احمد الحركة",
    subject: "دين",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 150,
  },
  {
    teacher: "احمد الحركة",
    subject: "دين",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 163,
  },
  {
    teacher: "احمد الحركة",
    subject: "دين",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 177,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 1 A",
    hours: 2,
    sourceRow: 126,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 1 B",
    hours: 2,
    sourceRow: 135,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 2 A",
    hours: 2,
    sourceRow: 210,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 2 B",
    hours: 2,
    sourceRow: 218,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 3 A",
    hours: 3,
    sourceRow: 228,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 3 B",
    hours: 3,
    sourceRow: 237,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 5 A",
    hours: 4,
    sourceRow: 271,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 5 B",
    hours: 4,
    sourceRow: 291,
  },
  {
    teacher: "اسراء فارس",
    subject: "SCIENCE",
    className: "Grade 5 C",
    hours: 4,
    sourceRow: 281,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "بيولوجي",
    className: "Grade 7 A",
    hours: 2,
    sourceRow: 331,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "بيولوجي",
    className: "Grade 7 B",
    hours: 2,
    sourceRow: 342,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "بيولوجي",
    className: "Grade 8 A",
    hours: 2,
    sourceRow: 352,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "بيولوجي",
    className: "Grade 8 B",
    hours: 2,
    sourceRow: 363,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "بيولوجي",
    className: "Grade 9 A",
    hours: 3,
    sourceRow: 379,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "بيولوجي",
    className: "Grade 9 B",
    hours: 3,
    sourceRow: 388,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "كيمياء",
    className: "Grade 7 A",
    hours: 2,
    sourceRow: 330,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "كيمياء",
    className: "Grade 7 B",
    hours: 2,
    sourceRow: 341,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "كيمياء",
    className: "Grade 8 A",
    hours: 2,
    sourceRow: 351,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "كيمياء",
    className: "Grade 8 B",
    hours: 2,
    sourceRow: 362,
  },
  {
    teacher: "الاء فخر الدين",
    subject: "SCIENCE",
    className: "Grade 6 A",
    hours: 4,
    sourceRow: 298,
  },
  {
    teacher: "اماني زين الدين",
    subject: "تربية",
    className: "Grade 4 A",
    hours: 1,
    sourceRow: 247,
  },
  {
    teacher: "اماني زين الدين",
    subject: "تربية",
    className: "Grade 4 B",
    hours: 1,
    sourceRow: 257,
  },
  {
    teacher: "اماني زين الدين",
    subject: "لغة عربية",
    className: "Grade 4 A",
    hours: 8,
    sourceRow: 242,
  },
  {
    teacher: "اماني زين الدين",
    subject: "لغة عربية",
    className: "Grade 4 B",
    hours: 8,
    sourceRow: 252,
  },
  {
    teacher: "اماني زين الدين",
    subject: "لغة عربية",
    className: "Grade 5 A",
    hours: 7,
    sourceRow: 270,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 1 A",
    hours: 1,
    sourceRow: 120,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 1 B",
    hours: 1,
    sourceRow: 129,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 2 A",
    hours: 1,
    sourceRow: 204,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 2 B",
    hours: 1,
    sourceRow: 213,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 3 A",
    hours: 1,
    sourceRow: 222,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 3 B",
    hours: 1,
    sourceRow: 231,
  },
  {
    teacher: "اميرة حمية",
    subject: "لغة ثانية",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 274,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "EB 4",
    hours: 1,
    sourceRow: 38,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "EB 5",
    hours: 1,
    sourceRow: 48,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "EB1",
    hours: 1,
    sourceRow: 88,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "EB2",
    hours: 1,
    sourceRow: 96,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 1 A",
    hours: 1,
    sourceRow: 119,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 1 B",
    hours: 1,
    sourceRow: 128,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 2 A",
    hours: 1,
    sourceRow: 203,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 2 B",
    hours: 1,
    sourceRow: 212,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 3 A",
    hours: 1,
    sourceRow: 221,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 3 B",
    hours: 1,
    sourceRow: 230,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 4 A",
    hours: 1,
    sourceRow: 239,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 4 B",
    hours: 1,
    sourceRow: 249,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 4 C",
    hours: 1,
    sourceRow: 264,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 268,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 288,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 278,
  },
  {
    teacher: "اميرة قمر",
    subject: "MATH",
    className: "Grade 10 B",
    hours: 5,
    sourceRow: 157,
  },
  {
    teacher: "اميرة قمر",
    subject: "MATH",
    className: "Grade 8 A",
    hours: 6,
    sourceRow: 355,
  },
  {
    teacher: "اميرة قمر",
    subject: "MATH",
    className: "Grade 8 B",
    hours: 6,
    sourceRow: 366,
  },
  {
    teacher: "اميرة قمر",
    subject: "MATH",
    className: "Grade 9 A",
    hours: 6,
    sourceRow: 378,
  },
  {
    teacher: "اميرة قمر",
    subject: "MATH",
    className: "Grade 9 B",
    hours: 6,
    sourceRow: 387,
  },
  {
    teacher: "اية ناصر",
    subject: "لغة ثانية",
    className: "EB 6",
    hours: 1,
    sourceRow: 60,
  },
  {
    teacher: "اية ناصر",
    subject: "ENGLISH French",
    className: "Grade 5 A",
    hours: 7,
    sourceRow: 275,
  },
  {
    teacher: "اية ناصر",
    subject: "ENGLISH French",
    className: "Grade 6 A",
    hours: 7,
    sourceRow: 304,
  },
  {
    teacher: "اية ناصر",
    subject: "ENGLISH French",
    className: "Grade 6 C",
    hours: 7,
    sourceRow: 314,
  },
  {
    teacher: "بتول كرنيب",
    subject: "تربية",
    className: "Grade 3 A",
    hours: 1,
    sourceRow: 223,
  },
  {
    teacher: "بتول كرنيب",
    subject: "تربية",
    className: "Grade 3 B",
    hours: 1,
    sourceRow: 232,
  },
  {
    teacher: "بتول كرنيب",
    subject: "لغة عربية",
    className: "Grade 4 C",
    hours: 8,
    sourceRow: 260,
  },
  {
    teacher: "بتول كرنيب",
    subject: "لغة عربية",
    className: "Grade 6 A",
    hours: 7,
    sourceRow: 299,
  },
  {
    teacher: "بتول كرنيب",
    subject: "لغة عربية",
    className: "Grade 6 B",
    hours: 7,
    sourceRow: 319,
  },
  {
    teacher: "حسن ناجي",
    subject: "كيمياء",
    className: "EB 7",
    hours: 2,
    sourceRow: 13,
  },
  {
    teacher: "حسن ناجي",
    subject: "كيمياء",
    className: "EB 8",
    hours: 2,
    sourceRow: 77,
  },
  {
    teacher: "حسن ناجي",
    subject: "كيمياء",
    className: "EB 9",
    hours: 2,
    sourceRow: 79,
  },
  {
    teacher: "حسن ناجي",
    subject: "كيمياء",
    className: "ES 2",
    hours: 2,
    sourceRow: 20,
  },
  {
    teacher: "حسن ناجي",
    subject: "كيمياء",
    className: "SE",
    hours: 1,
    sourceRow: 400,
  },
  {
    teacher: "حسن ناجي",
    subject: "كيمياء",
    className: "SV",
    hours: 4,
    sourceRow: 412,
  },
  {
    teacher: "حسن يزبك",
    subject: "MATH",
    className: "ES 1",
    hours: 5,
    sourceRow: 115,
  },
  {
    teacher: "حسن يزبك",
    subject: "MATH",
    className: "ES 2",
    hours: 5,
    sourceRow: 24,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "Grade 10 A",
    hours: 3,
    sourceRow: 141,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "Grade 10 B",
    hours: 3,
    sourceRow: 154,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "Grade 11 A",
    hours: 3,
    sourceRow: 167,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "Grade 11 B",
    hours: 3,
    sourceRow: 181,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "GRADE 12 ES",
    hours: 1,
    sourceRow: 191,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "Grade 9 A",
    hours: 3,
    sourceRow: 374,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "Grade 9 B",
    hours: 3,
    sourceRow: 383,
  },
  {
    teacher: "حنان بليطة",
    subject: "كيمياء",
    className: "LS",
    hours: 4,
    sourceRow: 390,
  },
  {
    teacher: "حوراء ابو حمدان",
    subject: "لغة عربية",
    className: "EB 7",
    hours: 6,
    sourceRow: 5,
  },
  {
    teacher: "حوراء ابو حمدان",
    subject: "لغة عربية",
    className: "Grade 6 C",
    hours: 7,
    sourceRow: 309,
  },
  {
    teacher: "حوراء ابو حمدان",
    subject: "لغة عربية",
    className: "Grade 7 A",
    hours: 6,
    sourceRow: 329,
  },
  {
    teacher: "حوراء ابو حمدان",
    subject: "لغة عربية",
    className: "Grade 7 B",
    hours: 6,
    sourceRow: 340,
  },
  {
    teacher: "رانيا ابراهيم",
    subject: "ENGLISH French",
    className: "EB 4",
    hours: 8,
    sourceRow: 39,
  },
  {
    teacher: "رانيا ابراهيم",
    subject: "ENGLISH French",
    className: "EB 5",
    hours: 7,
    sourceRow: 49,
  },
  {
    teacher: "رانيا ابراهيم",
    subject: "ENGLISH French",
    className: "EB 6",
    hours: 7,
    sourceRow: 59,
  },
  {
    teacher: "رانيا ابراهيم",
    subject: "ENGLISH French",
    className: "EB 7",
    hours: 7,
    sourceRow: 8,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 11 A",
    hours: 4,
    sourceRow: 170,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 11 B",
    hours: 4,
    sourceRow: 186,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 7 B",
    hours: 2,
    sourceRow: 343,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 8 A",
    hours: 2,
    sourceRow: 353,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 8 B",
    hours: 2,
    sourceRow: 364,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 9 A",
    hours: 2,
    sourceRow: 372,
  },
  {
    teacher: "رؤى الحاج حسن",
    subject: "فيزياء",
    className: "Grade 9 B",
    hours: 2,
    sourceRow: 381,
  },
  {
    teacher: "رباب العبد",
    subject: "بيولوجي",
    className: "EB 7",
    hours: 2,
    sourceRow: 9,
  },
  {
    teacher: "رباب العبد",
    subject: "بيولوجي",
    className: "EB 8",
    hours: 2,
    sourceRow: 70,
  },
  {
    teacher: "رباب العبد",
    subject: "بيولوجي",
    className: "EB 9",
    hours: 3,
    sourceRow: 80,
  },
  {
    teacher: "رباب العبد",
    subject: "بيولوجي",
    className: "ES 1",
    hours: 2,
    sourceRow: 110,
  },
  {
    teacher: "رباب العبد",
    subject: "بيولوجي",
    className: "SE",
    hours: 1,
    sourceRow: 401,
  },
  {
    teacher: "ريان جلول",
    subject: "MATH",
    className: "Grade 10 A",
    hours: 5,
    sourceRow: 144,
  },
  {
    teacher: "ريان جلول",
    subject: "MATH",
    className: "Grade 11 A",
    hours: 5,
    sourceRow: 171,
  },
  {
    teacher: "ريان جلول",
    subject: "MATH",
    className: "Grade 11 B",
    hours: 5,
    sourceRow: 184,
  },
  {
    teacher: "ريان جلول",
    subject: "MATH",
    className: "GRADE 12 ES",
    hours: 5,
    sourceRow: 199,
  },
  {
    teacher: "ريان جلول",
    subject: "MATH",
    className: "LS",
    hours: 5,
    sourceRow: 396,
  },
  {
    teacher: "ريم حمادة",
    subject: "ENGLISH French",
    className: "Grade 2 A",
    hours: 9,
    sourceRow: 205,
  },
  {
    teacher: "ريم حمادة",
    subject: "ENGLISH French",
    className: "Grade 2 B",
    hours: 9,
    sourceRow: 214,
  },
  {
    teacher: "ريم حمادة",
    subject: "ENGLISH French",
    className: "Grade 3 A",
    hours: 9,
    sourceRow: 224,
  },
  {
    teacher: "ريما عيسى",
    subject: "اجتماع",
    className: "ES 1",
    hours: 1,
    sourceRow: 117,
  },
  {
    teacher: "ريما عيسى",
    subject: "اجتماع",
    className: "ES 2",
    hours: 1,
    sourceRow: 28,
  },
  {
    teacher: "ريما عيسى",
    subject: "اجتماع",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 148,
  },
  {
    teacher: "ريما عيسى",
    subject: "اجتماع",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 161,
  },
  {
    teacher: "ريما عيسى",
    subject: "اجتماع",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 175,
  },
  {
    teacher: "ريما عيسى",
    subject: "اجتماع",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 189,
  },
  {
    teacher: "زهراء الشيخ",
    subject: "لغة عربية",
    className: "EB 5",
    hours: 7,
    sourceRow: 51,
  },
  {
    teacher: "زهراء الشيخ",
    subject: "لغة عربية",
    className: "EB 6",
    hours: 7,
    sourceRow: 58,
  },
  {
    teacher: "زهراء الشيخ",
    subject: "لغة عربية",
    className: "Grade 5 B",
    hours: 7,
    sourceRow: 290,
  },
  {
    teacher: "زهراء الشيخ",
    subject: "لغة عربية",
    className: "Grade 5 C",
    hours: 7,
    sourceRow: 280,
  },
  {
    teacher: "زهراء طالب",
    subject: "MATH",
    className: "Grade 1 A",
    hours: 5,
    sourceRow: 121,
  },
  {
    teacher: "زهراء طالب",
    subject: "MATH",
    className: "Grade 1 B",
    hours: 5,
    sourceRow: 130,
  },
  {
    teacher: "زهراء طالب",
    subject: "MATH",
    className: "Grade 2 A",
    hours: 5,
    sourceRow: 206,
  },
  {
    teacher: "زهراء طالب",
    subject: "MATH",
    className: "Grade 2 B",
    hours: 5,
    sourceRow: 215,
  },
  {
    teacher: "زهراء طالب",
    subject: "MATH",
    className: "Grade 4 B",
    hours: 5,
    sourceRow: 250,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "ES 1",
    hours: 4,
    sourceRow: 111,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "ES 2",
    hours: 3,
    sourceRow: 21,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "Grade 10 A",
    hours: 4,
    sourceRow: 142,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "Grade 10 B",
    hours: 4,
    sourceRow: 155,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "Grade 11 A",
    hours: 3,
    sourceRow: 168,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "Grade 11 B",
    hours: 3,
    sourceRow: 182,
  },
  {
    teacher: "زهراء مصطفى",
    subject: "لغة عربية",
    className: "Grade 9 A",
    hours: 6,
    sourceRow: 380,
  },
  {
    teacher: "زينب سرور",
    subject: "لغة عربية",
    className: "EB1",
    hours: 8,
    sourceRow: 15,
  },
  {
    teacher: "زينب سرور",
    subject: "لغة عربية",
    className: "Grade 1 A",
    hours: 8,
    sourceRow: 122,
  },
  {
    teacher: "زينب سرور",
    subject: "لغة عربية",
    className: "GRADE 1 B",
    hours: 8,
    sourceRow: 131,
  },
  {
    teacher: "زينب محسن",
    subject: "لغة ثانية",
    className: "EB 3",
    hours: 1,
    sourceRow: 36,
  },
  {
    teacher: "زينب محسن",
    subject: "لغة ثانية",
    className: "EB 4",
    hours: 1,
    sourceRow: 45,
  },
  {
    teacher: "زينب محسن",
    subject: "لغة ثانية",
    className: "EB1",
    hours: 1,
    sourceRow: 94,
  },
  {
    teacher: "زينب محسن",
    subject: "لغة ثانية",
    className: "EB2",
    hours: 1,
    sourceRow: 97,
  },
  {
    teacher: "زينب محسن",
    subject: "ENGLISH French",
    className: "Grade 6 B",
    hours: 7,
    sourceRow: 324,
  },
  {
    teacher: "زينب محسن",
    subject: "ENGLISH French",
    className: "Grade 7 A",
    hours: 7,
    sourceRow: 334,
  },
  {
    teacher: "زينب محسن",
    subject: "ENGLISH French",
    className: "Grade 7 B",
    hours: 7,
    sourceRow: 344,
  },
  {
    teacher: "زينة حاوي",
    subject: "ENGLISH French",
    className: "Grade 3 B",
    hours: 9,
    sourceRow: 233,
  },
  {
    teacher: "زينة حاوي",
    subject: "ENGLISH French",
    className: "Grade 4 A",
    hours: 8,
    sourceRow: 241,
  },
  {
    teacher: "زينة حاوي",
    subject: "ENGLISH French",
    className: "Grade 4 C",
    hours: 8,
    sourceRow: 266,
  },
  {
    teacher: "سارة خليل",
    subject: "ENGLISH French",
    className: "Grade 8 A",
    hours: 6,
    sourceRow: 354,
  },
  {
    teacher: "سارة خليل",
    subject: "ENGLISH French",
    className: "Grade 8 B",
    hours: 6,
    sourceRow: 365,
  },
  {
    teacher: "سارة خليل",
    subject: "ENGLISH French",
    className: "Grade 9 A",
    hours: 7,
    sourceRow: 373,
  },
  {
    teacher: "سارة خليل",
    subject: "ENGLISH French",
    className: "Grade 9 B",
    hours: 7,
    sourceRow: 382,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "ES 1",
    hours: 1,
    sourceRow: 112,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "ES 2",
    hours: 2,
    sourceRow: 22,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 143,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 156,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "Grade 11 A",
    hours: 2,
    sourceRow: 169,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "Grade 11 B",
    hours: 2,
    sourceRow: 183,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "GRADE 12 ES",
    hours: 6,
    sourceRow: 192,
  },
  {
    teacher: "سحر فقيه",
    subject: "اقتصاد",
    className: "SE",
    hours: 6,
    sourceRow: 409,
  },
  {
    teacher: "صبحي حمية",
    subject: "فيزياء",
    className: "ES 1",
    hours: 4,
    sourceRow: 113,
  },
  {
    teacher: "صبحي حمية",
    subject: "فيزياء",
    className: "ES 2",
    hours: 5,
    sourceRow: 23,
  },
  {
    teacher: "صبحي حمية",
    subject: "فيزياء",
    className: "SE",
    hours: 1,
    sourceRow: 403,
  },
  {
    teacher: "صبحي حمية",
    subject: "فيزياء",
    className: "SV",
    hours: 6,
    sourceRow: 413,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "EB 4",
    hours: 1,
    sourceRow: 41,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "EB1",
    hours: 2,
    sourceRow: 90,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "EB2",
    hours: 2,
    sourceRow: 98,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 1 A",
    hours: 2,
    sourceRow: 124,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 1 B",
    hours: 2,
    sourceRow: 133,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 2 A",
    hours: 2,
    sourceRow: 208,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 2 B",
    hours: 2,
    sourceRow: 216,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 3 A",
    hours: 1,
    sourceRow: 225,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 3 B",
    hours: 1,
    sourceRow: 234,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 4 A",
    hours: 1,
    sourceRow: 243,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 4 B",
    hours: 1,
    sourceRow: 253,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    className: "Grade 4 C",
    hours: 1,
    sourceRow: 263,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "EB 7",
    hours: 1,
    sourceRow: 12,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "EB 8",
    hours: 1,
    sourceRow: 74,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "EB 9",
    hours: 1,
    sourceRow: 84,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "Grade 7 A",
    hours: 1,
    sourceRow: 337,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "Grade 7 B",
    hours: 1,
    sourceRow: 348,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "Grade 8 A",
    hours: 1,
    sourceRow: 358,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "Grade 8 B",
    hours: 1,
    sourceRow: 369,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "Grade 9 A",
    hours: 1,
    sourceRow: 377,
  },
  {
    teacher: "عبير نون",
    subject: "تاريخ",
    className: "Grade 9 B",
    hours: 1,
    sourceRow: 386,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "EB 7",
    hours: 1,
    sourceRow: 10,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "EB 8",
    hours: 1,
    sourceRow: 72,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "EB 9",
    hours: 1,
    sourceRow: 82,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "Grade 7 A",
    hours: 1,
    sourceRow: 335,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "Grade 7 B",
    hours: 1,
    sourceRow: 346,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "Grade 8 A",
    hours: 1,
    sourceRow: 356,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "Grade 8 B",
    hours: 1,
    sourceRow: 367,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "Grade 9 A",
    hours: 1,
    sourceRow: 375,
  },
  {
    teacher: "عبير نون",
    subject: "تربية",
    className: "Grade 9 B",
    hours: 1,
    sourceRow: 384,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "EB 7",
    hours: 1,
    sourceRow: 11,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "EB 8",
    hours: 1,
    sourceRow: 73,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "EB 9",
    hours: 1,
    sourceRow: 83,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "Grade 7 A",
    hours: 1,
    sourceRow: 336,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "Grade 7 B",
    hours: 1,
    sourceRow: 347,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "Grade 8 A",
    hours: 1,
    sourceRow: 357,
  },
  {
    teacher: "عبير نون",
    subject: "جغرافيا",
    className: "Grade 8 B",
    hours: 1,
    sourceRow: 368,
  },
  {
    teacher: "عربية غيث",
    subject: "MATH",
    className: "Grade 6 A",
    hours: 5,
    sourceRow: 300,
  },
  {
    teacher: "عربية غيث",
    subject: "MATH",
    className: "Grade 6 B",
    hours: 5,
    sourceRow: 320,
  },
  {
    teacher: "عربية غيث",
    subject: "MATH",
    className: "Grade 6 C",
    hours: 5,
    sourceRow: 310,
  },
  {
    teacher: "عربية غيث",
    subject: "MATH",
    className: "Grade 7 A",
    hours: 6,
    sourceRow: 333,
  },
  {
    teacher: "عربية غيث",
    subject: "MATH",
    className: "Grade 7 B",
    hours: 6,
    sourceRow: 345,
  },
  {
    teacher: "علي بندر",
    subject: "MATH",
    className: "SE",
    hours: 5,
    sourceRow: 410,
  },
  {
    teacher: "علي بندر",
    subject: "MATH",
    className: "SV",
    hours: 5,
    sourceRow: 418,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "EB 5",
    hours: 1,
    sourceRow: 422,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "EB 6",
    hours: 1,
    sourceRow: 423,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 424,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 425,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 426,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 427,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 428,
  },
  {
    teacher: "علي حمادة",
    subject: "ثقافة عامة",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 429,
  },
  {
    teacher: "غنى بيضون",
    subject: "MATH",
    className: "Grade 3 A",
    hours: 5,
    sourceRow: 226,
  },
  {
    teacher: "غنى بيضون",
    subject: "MATH",
    className: "Grade 3 B",
    hours: 5,
    sourceRow: 235,
  },
  {
    teacher: "غنى بيضون",
    subject: "MATH",
    className: "Grade 4 A",
    hours: 5,
    sourceRow: 244,
  },
  {
    teacher: "غنى بيضون",
    subject: "MATH",
    className: "Grade 4 C",
    hours: 5,
    sourceRow: 261,
  },
  {
    teacher: "غنى بيضون",
    subject: "MATH",
    className: "Grade 5 A",
    hours: 5,
    sourceRow: 269,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "EB 4",
    hours: 1,
    sourceRow: 42,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "EB 5",
    hours: 1,
    sourceRow: 52,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "EB 6",
    hours: 1,
    sourceRow: 61,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "EB1",
    hours: 1,
    sourceRow: 92,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "EB2",
    hours: 1,
    sourceRow: 99,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 1 A",
    hours: 1,
    sourceRow: 125,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 1 B",
    hours: 1,
    sourceRow: 134,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 2 A",
    hours: 1,
    sourceRow: 209,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 2 B",
    hours: 1,
    sourceRow: 217,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 3 A",
    hours: 1,
    sourceRow: 227,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 3 B",
    hours: 1,
    sourceRow: 236,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 4 A",
    hours: 1,
    sourceRow: 245,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 4 B",
    hours: 1,
    sourceRow: 254,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 4 C",
    hours: 1,
    sourceRow: 265,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 273,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 292,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 282,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 301,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 321,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 311,
  },
  {
    teacher: "كاتيا ابراهيم",
    subject: "لغة ثانية",
    className: "Grade 4 A",
    hours: 1,
    sourceRow: 246,
  },
  {
    teacher: "كاتيا ابراهيم",
    subject: "لغة ثانية",
    className: "Grade 4 B",
    hours: 1,
    sourceRow: 255,
  },
  {
    teacher: "كاتيا ابراهيم",
    subject: "لغة ثانية",
    className: "Grade 4 C",
    hours: 1,
    sourceRow: 267,
  },
  {
    teacher: "كاتيا ابراهيم",
    subject: "MATH",
    className: "EB1",
    hours: 5,
    sourceRow: 91,
  },
  {
    teacher: "لبنى ترمس",
    subject: "لغة عربية",
    className: "EB 8",
    hours: 7,
    sourceRow: 71,
  },
  {
    teacher: "لبنى ترمس",
    subject: "لغة عربية",
    className: "Grade 8 A",
    hours: 7,
    sourceRow: 359,
  },
  {
    teacher: "لبنى ترمس",
    subject: "لغة عربية",
    className: "Grade 8 B",
    hours: 7,
    sourceRow: 370,
  },
  {
    teacher: "ليلى السيد",
    subject: "ENGLISH French",
    className: "EB 8",
    hours: 6,
    sourceRow: 75,
  },
  {
    teacher: "ليلى السيد",
    subject: "ENGLISH French",
    className: "EB 9",
    hours: 7,
    sourceRow: 85,
  },
  {
    teacher: "ليلى السيد",
    subject: "ENGLISH French",
    className: "ES 1",
    hours: 5,
    sourceRow: 114,
  },
  {
    teacher: "ليلى السيد",
    subject: "ENGLISH French",
    className: "ES 2",
    hours: 3,
    sourceRow: 25,
  },
  {
    teacher: "ليلى السيد",
    subject: "ENGLISH French",
    className: "SE",
    hours: 5,
    sourceRow: 404,
  },
  {
    teacher: "ليلى السيد",
    subject: "ENGLISH French",
    className: "SV",
    hours: 2,
    sourceRow: 414,
  },
  {
    teacher: "لينا خليل",
    subject: "MATH",
    className: "EB 3",
    hours: 5,
    sourceRow: 34,
  },
  {
    teacher: "لينا خليل",
    subject: "MATH",
    className: "EB 4",
    hours: 5,
    sourceRow: 43,
  },
  {
    teacher: "لينا خليل",
    subject: "MATH",
    className: "EB 5",
    hours: 5,
    sourceRow: 53,
  },
  {
    teacher: "لينا خليل",
    subject: "MATH",
    className: "EB 6",
    hours: 5,
    sourceRow: 62,
  },
  {
    teacher: "لينا خليل",
    subject: "MATH",
    className: "EB2",
    hours: 5,
    sourceRow: 100,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "ES 1",
    hours: 1,
    sourceRow: 108,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "ES 2",
    hours: 1,
    sourceRow: 19,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 140,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 153,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 166,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 180,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "GRADE 12 ES",
    hours: 1,
    sourceRow: 197,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "LS",
    hours: 1,
    sourceRow: 395,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "SE",
    hours: 1,
    sourceRow: 407,
  },
  {
    teacher: "محمد المصري",
    subject: "تاريخ",
    className: "SV",
    hours: 1,
    sourceRow: 417,
  },
  {
    teacher: "محمد المصري",
    subject: "تربية",
    className: "ES 1",
    hours: 1,
    sourceRow: 106,
  },
  {
    teacher: "محمد المصري",
    subject: "تربية",
    className: "ES 2",
    hours: 1,
    sourceRow: 17,
  },
  {
    teacher: "محمد المصري",
    subject: "تربية",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 138,
  },
  {
    teacher: "محمد المصري",
    subject: "تربية",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 151,
  },
  {
    teacher: "محمد المصري",
    subject: "تربية",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 164,
  },
  {
    teacher: "محمد المصري",
    subject: "تربية",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 178,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "ES 1",
    hours: 1,
    sourceRow: 107,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "ES 2",
    hours: 1,
    sourceRow: 18,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 139,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 152,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 165,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 179,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "Grade 9 A",
    hours: 1,
    sourceRow: 376,
  },
  {
    teacher: "محمد المصري",
    subject: "جغرافيا",
    className: "Grade 9 B",
    hours: 1,
    sourceRow: 385,
  },
  {
    teacher: "محمد جقمرة",
    subject: "بيولوجي",
    className: "Grade 10 A",
    hours: 2,
    sourceRow: 145,
  },
  {
    teacher: "محمد جقمرة",
    subject: "بيولوجي",
    className: "Grade 10 B",
    hours: 2,
    sourceRow: 158,
  },
  {
    teacher: "محمد جقمرة",
    subject: "بيولوجي",
    className: "Grade 11 A",
    hours: 3,
    sourceRow: 172,
  },
  {
    teacher: "محمد جقمرة",
    subject: "بيولوجي",
    className: "Grade 11 B",
    hours: 3,
    sourceRow: 185,
  },
  {
    teacher: "محمد جقمرة",
    subject: "بيولوجي",
    className: "GRADE 12 ES",
    hours: 1,
    sourceRow: 194,
  },
  {
    teacher: "محمد جقمرة",
    subject: "بيولوجي",
    className: "LS",
    hours: 6,
    sourceRow: 392,
  },
  {
    teacher: "محمد جقمرة",
    subject: "فيزياء",
    className: "GRADE 12 ES",
    hours: 1,
    sourceRow: 193,
  },
  {
    teacher: "محمد جمال الدين",
    subject: "دين",
    className: "EB 7",
    hours: 1,
    sourceRow: 4,
  },
  {
    teacher: "محمد جمال الدين",
    subject: "دين",
    className: "EB 8",
    hours: 1,
    sourceRow: 68,
  },
  {
    teacher: "محمد جمال الدين",
    subject: "دين",
    className: "Grade 7 A",
    hours: 1,
    sourceRow: 328,
  },
  {
    teacher: "محمد جمال الدين",
    subject: "دين",
    className: "Grade 7 B",
    hours: 1,
    sourceRow: 339,
  },
  {
    teacher: "محمد جمال الدين",
    subject: "دين",
    className: "Grade 8 A",
    hours: 1,
    sourceRow: 350,
  },
  {
    teacher: "محمد جمال الدين",
    subject: "دين",
    className: "Grade 8 B",
    hours: 1,
    sourceRow: 361,
  },
  {
    teacher: "محمد عبدو",
    subject: "اجتماع",
    className: "GRADE 12 ES",
    hours: 3,
    sourceRow: 198,
  },
  {
    teacher: "محمد عبدو",
    subject: "اجتماع",
    className: "SE",
    hours: 3,
    sourceRow: 408,
  },
  {
    teacher: "محمد عبدو",
    subject: "تربية",
    className: "GRADE 12 ES",
    hours: 1,
    sourceRow: 195,
  },
  {
    teacher: "محمد عبدو",
    subject: "تربية",
    className: "LS",
    hours: 1,
    sourceRow: 393,
  },
  {
    teacher: "محمد عبدو",
    subject: "تربية",
    className: "SV",
    hours: 1,
    sourceRow: 415,
  },
  {
    teacher: "محمد عبدو",
    subject: "جغرافيا",
    className: "GRADE 12 ES",
    hours: 1,
    sourceRow: 196,
  },
  {
    teacher: "محمد عبدو",
    subject: "جغرافيا",
    className: "LS",
    hours: 1,
    sourceRow: 394,
  },
  {
    teacher: "محمد عبدو",
    subject: "جغرافيا",
    className: "SV",
    hours: 1,
    sourceRow: 416,
  },
  {
    teacher: "محمد عساف",
    subject: "فيزياء",
    className: "Grade 10 A",
    hours: 4,
    sourceRow: 146,
  },
  {
    teacher: "محمد عساف",
    subject: "فيزياء",
    className: "Grade 10 B",
    hours: 4,
    sourceRow: 159,
  },
  {
    teacher: "محمد عساف",
    subject: "فيزياء",
    className: "LS",
    hours: 6,
    sourceRow: 391,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "ES 2",
    hours: 1,
    sourceRow: 118,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 174,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 188,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "GRADE 12 ES",
    hours: 2,
    sourceRow: 200,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "LS",
    hours: 2,
    sourceRow: 397,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "SE",
    hours: 2,
    sourceRow: 402,
  },
  {
    teacher: "منى وهبي",
    subject: "فلسفة",
    className: "SV",
    hours: 2,
    sourceRow: 420,
  },
  {
    teacher: "ميساء الحسيني",
    subject: "لغة عربية",
    className: "EB2",
    hours: 8,
    sourceRow: 101,
  },
  {
    teacher: "ميساء الحسيني",
    subject: "لغة عربية",
    className: "Grade 2 A",
    hours: 8,
    sourceRow: 207,
  },
  {
    teacher: "ميساء الحسيني",
    subject: "لغة عربية",
    className: "Grade 2 B",
    hours: 8,
    sourceRow: 220,
  },
  {
    teacher: "ميساء غصن",
    subject: "ENGLISH French",
    className: "Grade 10 A",
    hours: 5,
    sourceRow: 149,
  },
  {
    teacher: "ميساء غصن",
    subject: "ENGLISH French",
    className: "Grade 10 B",
    hours: 5,
    sourceRow: 162,
  },
  {
    teacher: "ميساء غصن",
    subject: "ENGLISH French",
    className: "Grade 11 A",
    hours: 3,
    sourceRow: 176,
  },
  {
    teacher: "ميساء غصن",
    subject: "ENGLISH French",
    className: "Grade 11 B",
    hours: 3,
    sourceRow: 190,
  },
  {
    teacher: "ميساء غصن",
    subject: "ENGLISH French",
    className: "GRADE 12 ES",
    hours: 5,
    sourceRow: 201,
  },
  {
    teacher: "ميساء غصن",
    subject: "ENGLISH French",
    className: "LS",
    hours: 2,
    sourceRow: 398,
  },
  {
    teacher: "ناجي هاشم",
    subject: "بيولوجي",
    className: "ES 2",
    hours: 3,
    sourceRow: 26,
  },
  {
    teacher: "ناجي هاشم",
    subject: "بيولوجي",
    className: "SV",
    hours: 6,
    sourceRow: 419,
  },
  {
    teacher: "نادين شرف",
    subject: "فيزياء",
    className: "EB 7",
    hours: 3,
    sourceRow: 7,
  },
  {
    teacher: "نادين شرف",
    subject: "فيزياء",
    className: "EB 8",
    hours: 2,
    sourceRow: 69,
  },
  {
    teacher: "نادين شرف",
    subject: "فيزياء",
    className: "EB 9",
    hours: 3,
    sourceRow: 81,
  },
  {
    teacher: "نادين شرف",
    subject: "فيزياء",
    className: "Grade 7 A",
    hours: 2,
    sourceRow: 332,
  },
  {
    teacher: "نادين شرف",
    subject: "كيمياء",
    className: "ES 1",
    hours: 3,
    sourceRow: 109,
  },
  {
    teacher: "نادين شرف",
    subject: "MATH",
    className: "EB 7",
    hours: 5,
    sourceRow: 6,
  },
  {
    teacher: "نادين شرف",
    subject: "MATH",
    className: "EB 8",
    hours: 6,
    sourceRow: 76,
  },
  {
    teacher: "نادين شرف",
    subject: "MATH",
    className: "EB 9",
    hours: 5,
    sourceRow: 86,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "EB 5",
    hours: 1,
    sourceRow: 54,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "EB 6",
    hours: 1,
    sourceRow: 63,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "EB 7",
    hours: 1,
    sourceRow: 14,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "EB 8",
    hours: 1,
    sourceRow: 78,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "ES 1",
    hours: 1,
    sourceRow: 116,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "ES 2",
    hours: 1,
    sourceRow: 27,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 10 A",
    hours: 1,
    sourceRow: 147,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 10 B",
    hours: 1,
    sourceRow: 160,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 11 A",
    hours: 1,
    sourceRow: 173,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 11 B",
    hours: 1,
    sourceRow: 187,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 272,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 294,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 284,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 303,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 323,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 313,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 7 A",
    hours: 1,
    sourceRow: 338,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 7 B",
    hours: 1,
    sourceRow: 349,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 8 A",
    hours: 1,
    sourceRow: 360,
  },
  {
    teacher: "نزيه طي",
    subject: "رياضة",
    className: "Grade 8 B",
    hours: 1,
    sourceRow: 371,
  },
  {
    teacher: "نسرين رضا",
    subject: "MATH",
    className: "Grade 5 B",
    hours: 5,
    sourceRow: 289,
  },
  {
    teacher: "نسرين رضا",
    subject: "MATH",
    className: "Grade 5 C",
    hours: 5,
    sourceRow: 279,
  },
  {
    teacher: "نسرين رضا",
    subject: "SCIENCE",
    className: "Grade 4 B",
    hours: 3,
    sourceRow: 256,
  },
  {
    teacher: "نسرين رضا",
    subject: "SCIENCE",
    className: "Grade 4 C",
    hours: 3,
    sourceRow: 259,
  },
  {
    teacher: "نسرين رضا",
    subject: "SCIENCE",
    className: "Grade 6 B",
    hours: 4,
    sourceRow: 318,
  },
  {
    teacher: "نسرين رضا",
    subject: "SCIENCE",
    className: "Grade 6 C",
    hours: 4,
    sourceRow: 308,
  },
  {
    teacher: "نور بليبل",
    subject: "لغة ثانية",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 293,
  },
  {
    teacher: "نور بليبل",
    subject: "لغة ثانية",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 283,
  },
  {
    teacher: "نور بليبل",
    subject: "لغة ثانية",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 302,
  },
  {
    teacher: "نور بليبل",
    subject: "لغة ثانية",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 322,
  },
  {
    teacher: "نور بليبل",
    subject: "لغة ثانية",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 312,
  },
  {
    teacher: "نور بليبل",
    subject: "SCIENCE",
    className: "EB 3",
    hours: 3,
    sourceRow: 35,
  },
  {
    teacher: "نور بليبل",
    subject: "SCIENCE",
    className: "EB 4",
    hours: 3,
    sourceRow: 44,
  },
  {
    teacher: "نور بليبل",
    subject: "SCIENCE",
    className: "EB 5",
    hours: 4,
    sourceRow: 55,
  },
  {
    teacher: "نور بليبل",
    subject: "SCIENCE",
    className: "EB 6",
    hours: 4,
    sourceRow: 64,
  },
  {
    teacher: "نور بليبل",
    subject: "SCIENCE",
    className: "EB1",
    hours: 3,
    sourceRow: 93,
  },
  {
    teacher: "نور بليبل",
    subject: "SCIENCE",
    className: "EB2",
    hours: 2,
    sourceRow: 102,
  },
  {
    teacher: "نور شغري",
    subject: "ENGLISH French",
    className: "Grade 4 B",
    hours: 8,
    sourceRow: 251,
  },
  {
    teacher: "نور شغري",
    subject: "ENGLISH French",
    className: "Grade 5 B",
    hours: 7,
    sourceRow: 295,
  },
  {
    teacher: "نور شغري",
    subject: "ENGLISH French",
    className: "Grade 5 C",
    hours: 7,
    sourceRow: 285,
  },
  {
    teacher: "نور شغري",
    subject: "SCIENCE",
    className: "Grade 4 A",
    hours: 3,
    sourceRow: 240,
  },
  {
    teacher: "هالة جلوان",
    subject: "تربية",
    className: "EB1",
    hours: 1,
    sourceRow: 89,
  },
  {
    teacher: "هالة جلوان",
    subject: "تربية",
    className: "Grade 1 A",
    hours: 1,
    sourceRow: 123,
  },
  {
    teacher: "هالة جلوان",
    subject: "تربية",
    className: "Grade 1 B",
    hours: 1,
    sourceRow: 132,
  },
  {
    teacher: "هالة جلوان",
    subject: "تربية",
    className: "Grade 2 A",
    hours: 1,
    sourceRow: 211,
  },
  {
    teacher: "هالة جلوان",
    subject: "تربية",
    className: "Grade 2 B",
    hours: 1,
    sourceRow: 219,
  },
  {
    teacher: "هالة جلوان",
    subject: "لغة ثانية",
    className: "EB 5",
    hours: 1,
    sourceRow: 50,
  },
  {
    teacher: "هالة جلوان",
    subject: "ENGLISH French",
    className: "Grade 1 A",
    hours: 9,
    sourceRow: 127,
  },
  {
    teacher: "هالة جلوان",
    subject: "ENGLISH French",
    className: "Grade 1 B",
    hours: 9,
    sourceRow: 136,
  },
  {
    teacher: "هدى زين الدين",
    subject: "ENGLISH French",
    className: "EB 3",
    hours: 9,
    sourceRow: 37,
  },
  {
    teacher: "هدى زين الدين",
    subject: "ENGLISH French",
    className: "EB1",
    hours: 8,
    sourceRow: 95,
  },
  {
    teacher: "هدى زين الدين",
    subject: "ENGLISH French",
    className: "EB2",
    hours: 9,
    sourceRow: 103,
  },
  {
    teacher: "هديل قنبر",
    subject: "تاريخ",
    className: "EB 6",
    hours: 1,
    sourceRow: 67,
  },
  {
    teacher: "هديل قنبر",
    subject: "تاريخ",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 307,
  },
  {
    teacher: "هديل قنبر",
    subject: "تاريخ",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 327,
  },
  {
    teacher: "هديل قنبر",
    subject: "تاريخ",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 317,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "EB 4",
    hours: 1,
    sourceRow: 46,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "EB 5",
    hours: 1,
    sourceRow: 56,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "EB 6",
    hours: 1,
    sourceRow: 65,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 4 C",
    hours: 1,
    sourceRow: 262,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 276,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 296,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 286,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 305,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 325,
  },
  {
    teacher: "هديل قنبر",
    subject: "تربية",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 315,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "EB 4",
    hours: 1,
    sourceRow: 47,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "EB 5",
    hours: 1,
    sourceRow: 57,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "EB 6",
    hours: 1,
    sourceRow: 66,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 4 A",
    hours: 1,
    sourceRow: 248,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 4 B",
    hours: 1,
    sourceRow: 258,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 4 C",
    hours: 1,
    sourceRow: 262,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 5 A",
    hours: 1,
    sourceRow: 277,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 5 B",
    hours: 1,
    sourceRow: 297,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 5 C",
    hours: 1,
    sourceRow: 287,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 6 A",
    hours: 1,
    sourceRow: 306,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 6 B",
    hours: 1,
    sourceRow: 326,
  },
  {
    teacher: "هديل قنبر",
    subject: "جغرافيا",
    className: "Grade 6 C",
    hours: 1,
    sourceRow: 316,
  },
  {
    teacher: "هنادي نون",
    subject: "تربية",
    className: "EB2",
    hours: 1,
    sourceRow: 104,
  },
  {
    teacher: "هنادي نون",
    subject: "لغة عربية",
    className: "EB 4",
    hours: 8,
    sourceRow: 40,
  },
  {
    teacher: "هنادي نون",
    subject: "لغة عربية",
    className: "Grade 3 A",
    hours: 8,
    sourceRow: 229,
  },
  {
    teacher: "هنادي نون",
    subject: "لغة عربية",
    className: "Grade 3 B",
    hours: 8,
    sourceRow: 238,
  },
  {
    teacher: "وصال يوسف",
    subject: "لغة عربية",
    className: "EB 9",
    hours: 7,
    sourceRow: 87,
  },
  {
    teacher: "وصال يوسف",
    subject: "لغة عربية",
    className: "GRADE 12 ES",
    hours: 3,
    sourceRow: 202,
  },
  {
    teacher: "وصال يوسف",
    subject: "لغة عربية",
    className: "Grade 9 B",
    hours: 6,
    sourceRow: 389,
  },
  {
    teacher: "وصال يوسف",
    subject: "لغة عربية",
    className: "LS",
    hours: 2,
    sourceRow: 399,
  },
  {
    teacher: "وصال يوسف",
    subject: "لغة عربية",
    className: "SE",
    hours: 3,
    sourceRow: 411,
  },
  {
    teacher: "وصال يوسف",
    subject: "لغة عربية",
    className: "SV",
    hours: 2,
    sourceRow: 421,
  },
];

const sharedTeachingCombinations: SharedTeachingCombination[] = [
  {
    teacher: "هنادي نون",
    subject: "لغة عربية",
    anchorClassName: "Grade 3 A",
    sharedClassNames: ["EB 3"],
    hours: 8,
    sourceRow: 0,
  },
  {
    teacher: "اميرة حمية",
    subject: "ART",
    anchorClassName: "Grade 3 A",
    sharedClassNames: ["EB 3"],
    hours: 1,
    sourceRow: 0,
  },
  {
    teacher: "بتول كرنيب",
    subject: "تربية",
    anchorClassName: "Grade 3 A",
    sharedClassNames: ["EB 3"],
    hours: 1,
    sourceRow: 0,
  },
  {
    teacher: "عادل رزق",
    subject: "رياضة",
    anchorClassName: "Grade 3 A",
    sharedClassNames: ["EB 3"],
    hours: 1,
    sourceRow: 0,
  },
  {
    teacher: "فاطمة يحفوفي",
    subject: "دين",
    anchorClassName: "Grade 3 A",
    sharedClassNames: ["EB 3"],
    hours: 1,
    sourceRow: 0,
  },
  {
    teacher: "محمد عبدو",
    subject: "تربية",
    anchorClassName: "GRADE 12 ES",
    sharedClassNames: ["SE"],
    hours: 1,
    sourceRow: 0,
  },
  {
    teacher: "محمد عبدو",
    subject: "جغرافيا",
    anchorClassName: "GRADE 12 ES",
    sharedClassNames: ["SE"],
    hours: 1,
    sourceRow: 0,
  },
];

const sharedTeachingDetails: TeacherDetail[] =
  sharedTeachingCombinations.flatMap((combination) =>
    combination.sharedClassNames.map((className) => ({
      teacher: combination.teacher,
      subject: combination.subject,
      className,
      hours: combination.hours,
      sourceRow: combination.sourceRow,
    })),
  );

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function timeFromMinutes(minutes: number): Date {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return time(`${hours}:${remainder}`);
}

type ClassMetadata = {
  gradeCode: string;
  gradeName: string;
  displayOrder: number;
  sectionLabel: string;
  sectionName: string;
  shortCode: string;
};

function recessAfterSession(shortCode: string): number {
  const grade = /^(?:EB)?(\d+)/u.exec(shortCode)?.[1];
  if (!grade) return 4;
  const numericGrade = Number(grade);
  return numericGrade <= 6 ? 2 : numericGrade <= 9 ? 3 : 4;
}

function classMetadata(shortCode: string): ClassMetadata {
  const ebGrade = /^EB(\d+)$/u.exec(shortCode);
  if (ebGrade) {
    return {
      gradeCode: `G${ebGrade[1]}`,
      gradeName: `G${ebGrade[1]}`,
      displayOrder: Number(ebGrade[1]),
      sectionLabel: "EB",
      sectionName: shortCode,
      shortCode,
    };
  }

  const gradeSection = /^(\d+)([A-Z])$/u.exec(shortCode);
  if (gradeSection) {
    return {
      gradeCode: `G${gradeSection[1]}`,
      gradeName: `G${gradeSection[1]}`,
      displayOrder: Number(gradeSection[1]),
      sectionLabel: gradeSection[2],
      sectionName: shortCode,
      shortCode,
    };
  }

  const esSection = /^ES(\d+)$/u.exec(shortCode);
  if (esSection) {
    return {
      gradeCode: "G12_ES",
      gradeName: "G12 ES",
      displayOrder: 15,
      sectionLabel: esSection[1],
      sectionName: shortCode,
      shortCode,
    };
  }

  if (shortCode === "ES" || shortCode === "SE") {
    return {
      gradeCode: "G12_ES",
      gradeName: "G12 ES",
      displayOrder: 15,
      sectionLabel: shortCode,
      sectionName: shortCode,
      shortCode,
    };
  }

  if (shortCode === "LS") {
    return {
      gradeCode: "G12_LS",
      gradeName: "G12 LS",
      displayOrder: 14,
      sectionLabel: "LS",
      sectionName: shortCode,
      shortCode,
    };
  }

  if (shortCode === "SV") {
    return {
      gradeCode: "G12_GS",
      gradeName: "G12 GS",
      displayOrder: 16,
      sectionLabel: "SV",
      sectionName: shortCode,
      shortCode,
    };
  }

  return {
    gradeCode: "G12",
    gradeName: "G12",
    displayOrder: 12,
    sectionLabel: shortCode,
    sectionName: shortCode,
    shortCode,
  };
}

function curriculumKey(gradeLevelId: string, subjectId: string): string {
  return `${gradeLevelId}:${subjectId}`;
}

const upperSecondaryMainSubjectsByGrade = {
  G11: ["MATH", "فيزياء"],
  G12_LS: ["MATH", "فيزياء", "كيمياء", "بيولوجي"],
  G12_GS: ["MATH", "فيزياء", "كيمياء", "بيولوجي"],
  G12_ES: ["MATH", "اقتصاد", "اجتماع"],
} satisfies Record<string, readonly string[]>;

function isMainSubject(
  subjectName: string,
  weeklySessions: number,
  metadata: ClassMetadata,
): boolean {
  const normalized = subjectName.trim().toUpperCase();
  const upperSecondaryMainSubjects =
    upperSecondaryMainSubjectsByGrade[
      metadata.gradeCode as keyof typeof upperSecondaryMainSubjectsByGrade
    ];
  if (upperSecondaryMainSubjects) {
    return upperSecondaryMainSubjects.includes(normalized);
  }

  return (
    weeklySessions > schoolWeekConfiguration.workingDayCount ||
    [
      "ARABIC",
      "ENGLISH",
      "ENGLISH FRENCH",
      "MATH",
      "MATHEMATICS",
      "لغة عربية",
    ].includes(normalized)
  );
}

function normalizeClassCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/gu, " ");
  const gradeSection = /^GRADE (\d+) ([A-Z])$/u.exec(normalized);
  if (gradeSection) {
    return `${gradeSection[1]}${gradeSection[2]}`;
  }
  const gradeTwelveTrack = /^GRADE 12 ([A-Z0-9]+)$/u.exec(normalized);
  if (gradeTwelveTrack) {
    return gradeTwelveTrack[1];
  }
  const ebClass = /^EB\s*(\d+)$/u.exec(normalized);
  if (ebClass) {
    return `EB${ebClass[1]}`;
  }
  const esClass = /^ES\s*(\d+)$/u.exec(normalized);
  if (esClass) {
    return `ES${esClass[1]}`;
  }
  return normalized.replace(/\s+/gu, "");
}

function stableCode(prefix: string, index: number): string {
  return `${prefix}${String(index + 1).padStart(3, "0")}`;
}

async function clearSeedData(): Promise<void> {
  const db = getDatabase();

  await db.auditLog.deleteMany();
  await db.scheduleAssignment.deleteMany();
  await db.schedule.deleteMany();
  await db.generationDiagnostic.deleteMany();
  await db.generationAlternative.deleteMany();
  await db.generationJob.deleteMany();
  await db.requirementForbiddenSlot.deleteMany();
  await db.requirementFixedSlot.deleteMany();
  await db.teachingRequirement.deleteMany();
  await db.availabilityRule.deleteMany();
  await db.constraintWeight.deleteMany();
  await db.constraintProfile.deleteMany();
  await db.classCurriculum.deleteMany();
  await db.sharedTeachingGroup.deleteMany();
  await db.gradeCurriculum.deleteMany();
  await db.classSection.deleteMany();
  await db.room.deleteMany();
  await db.subject.deleteMany();
  await db.teacher.deleteMany();
  await db.slot.deleteMany();
  await db.periodDefinition.deleteMany();
  await db.dayDefinition.deleteMany();
  await db.schoolWeekConfiguration.deleteMany();
  await db.gradeLevel.deleteMany();
  await db.academicTerm.deleteMany();
  await db.user.deleteMany();
  await db.school.deleteMany();
}

async function main(): Promise<void> {
  const db = getDatabase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters.");
  }
  const passwordHash = await hash(adminPassword, 12);

  await clearSeedData();

  await db.school.create({
    data: {
      id: ids.school,
      name: "Al Massar",
      timezone: "Asia/Beirut",
    },
  });

  await db.user.create({
    data: {
      id: ids.admin,
      schoolId: ids.school,
      email: "admin@almassar.test",
      name: "Al Massar Administrator",
      passwordHash,
      isActive: true,
    },
  });

  await db.academicTerm.create({
    data: {
      id: ids.term,
      schoolId: ids.school,
      name: "2026-2027",
      startsOn: new Date("2026-09-01T00:00:00.000Z"),
      endsOn: new Date("2027-06-30T00:00:00.000Z"),
      isActive: true,
      roomsEnabled: false,
    },
  });

  await db.schoolWeekConfiguration.create({
    data: {
      schoolId: ids.school,
      termId: ids.term,
      ...schoolWeekConfiguration,
    },
  });

  const dayRecords = [];
  for (const [dayIndex, name] of days.entries()) {
    dayRecords.push(
      await db.dayDefinition.create({
        data: { schoolId: ids.school, termId: ids.term, dayIndex, name },
      }),
    );
  }

  const periodRecords = [];
  for (const period of buildSchoolPeriods(schoolWeekConfiguration)) {
    periodRecords.push(
      await db.periodDefinition.create({
        data: {
          schoolId: ids.school,
          termId: ids.term,
          periodIndex: period.periodIndex,
          name: period.name,
          startsAt: timeFromMinutes(period.startsAtMinutes),
          endsAt: timeFromMinutes(period.endsAtMinutes),
          isTeaching: period.isTeaching,
        },
      }),
    );
  }

  for (const day of dayRecords) {
    for (const period of periodRecords) {
      await db.slot.create({
        data: {
          schoolId: ids.school,
          termId: ids.term,
          dayId: day.id,
          periodId: period.id,
          dayIndex: day.dayIndex,
          periodIndex: period.periodIndex,
          isEnabled: true,
        },
      });
    }
  }

  const allTeacherDetails = [...teacherDetails, ...sharedTeachingDetails];
  const teacherHours = new Map<string, number>();
  for (const detail of teacherDetails) {
    teacherHours.set(
      detail.teacher,
      (teacherHours.get(detail.teacher) ?? 0) + detail.hours,
    );
  }

  const teacherIds = new Map<string, string>();
  for (const [teacherIndex, [teacherName, weeklyHours]] of [
    ...teacherHours.entries(),
  ].entries()) {
    const teacher = await db.teacher.create({
      data: {
        schoolId: ids.school,
        name: teacherName,
        shortCode: stableCode("T", teacherIndex),
        employmentType:
          teacherName in partTimeAvailabilityByTeacher || weeklyHours <= 20
            ? "PART_TIME"
            : "FULL_TIME",
        weeklyTeachingSessions: weeklyHours,
        maxWeeklyWorkload: weeklyHours,
      },
    });
    teacherIds.set(teacherName, teacher.id);
  }

  const teachingPeriodBySession = new Map(
    periodRecords
      .filter((period) => period.isTeaching)
      .map((period, index) => [index + 1, period.periodIndex]),
  );
  const unavailableRules = [];
  for (const [teacherName, availabilityByDay] of Object.entries(
    partTimeAvailabilityByTeacher,
  )) {
    const teacherId = teacherIds.get(teacherName);
    if (!teacherId) {
      throw new Error(
        `Cannot seed availability: unknown teacher ${teacherName}.`,
      );
    }
    for (const day of dayRecords) {
      const allowedSessions = new Set(
        availabilityByDay[day.name as DayName] ?? [],
      );
      for (
        let session = 1;
        session <= schoolWeekConfiguration.sessionsPerDay;
        session += 1
      ) {
        if (allowedSessions.has(session)) continue;
        const periodIndex = teachingPeriodBySession.get(session);
        if (periodIndex === undefined) {
          throw new Error(
            `Cannot seed availability: unresolved session ${String(session)}.`,
          );
        }
        unavailableRules.push({
          schoolId: ids.school,
          termId: ids.term,
          entityType: "TEACHER" as const,
          entityId: teacherId,
          dayIndex: day.dayIndex,
          periodIndex,
          state: "UNAVAILABLE" as const,
          reason: "Seeded part-time availability.",
        });
      }
    }
  }
  if (unavailableRules.length > 0) {
    await db.availabilityRule.createMany({ data: unavailableRules });
  }

  const seededUnavailableRules = [];
  for (const [teacherName, unavailableSessions] of Object.entries(
    seededUnavailableSessionsByTeacher,
  )) {
    const teacherId = teacherIds.get(teacherName);
    if (!teacherId) {
      throw new Error(
        `Cannot seed unavailable sessions: unknown teacher ${teacherName}.`,
      );
    }
    for (const day of dayRecords) {
      for (const session of unavailableSessions) {
        const periodIndex = teachingPeriodBySession.get(session);
        if (periodIndex === undefined) {
          throw new Error(
            `Cannot seed unavailable sessions: unresolved session ${String(session)}.`,
          );
        }
        seededUnavailableRules.push({
          schoolId: ids.school,
          termId: ids.term,
          entityType: "TEACHER" as const,
          entityId: teacherId,
          dayIndex: day.dayIndex,
          periodIndex,
          state: "UNAVAILABLE" as const,
          reason: "Sport cannot be scheduled in sessions 3 or 4.",
        });
      }
    }
  }
  if (seededUnavailableRules.length > 0) {
    await db.availabilityRule.createMany({ data: seededUnavailableRules });
  }

  const subjectIds = new Map<string, string>();
  const subjectNames = [
    ...new Set(allTeacherDetails.map((detail) => detail.subject)),
  ];
  for (const [subjectIndex, subjectName] of subjectNames.entries()) {
    const subject = await db.subject.create({
      data: {
        schoolId: ids.school,
        name: subjectName,
        shortCode: stableCode("S", subjectIndex),
        consecutivePeriodsAllowed: true,
        consecutivePeriodsPreferred: true,
      },
    });
    subjectIds.set(subjectName, subject.id);
  }

  const gradeLevelIds = new Map<string, string>();
  const allClasses = [...gradesSevenToTwelveClasses, ...gradesOneToSixClasses];
  const metadataByClass: Map<string, ClassMetadata> = new Map(
    allClasses.map((shortCode) => [shortCode, classMetadata(shortCode)]),
  );
  const uniqueGrades = [
    ...new Map(
      [...metadataByClass.values()].map((metadata) => [
        metadata.gradeCode,
        metadata,
      ]),
    ).values(),
  ].sort((left, right) => left.displayOrder - right.displayOrder);

  for (const [gradeIndex, metadata] of uniqueGrades.entries()) {
    const gradeLevel = await db.gradeLevel.create({
      data: {
        schoolId: ids.school,
        code: metadata.gradeCode,
        name: metadata.gradeName,
        displayOrder: gradeIndex,
        isActive: true,
      },
    });
    gradeLevelIds.set(metadata.gradeCode, gradeLevel.id);
  }

  const classIds = new Map<string, string>();
  for (const shortCode of allClasses) {
    const metadata = metadataByClass.get(shortCode);
    if (!metadata) {
      throw new Error(`Cannot seed class ${shortCode}: missing metadata.`);
    }
    const gradeLevelId = gradeLevelIds.get(metadata.gradeCode);
    if (!gradeLevelId) {
      throw new Error(
        `Cannot seed class ${shortCode}: unresolved grade ${metadata.gradeCode}.`,
      );
    }
    const classSection = await db.classSection.create({
      data: {
        schoolId: ids.school,
        termId: ids.term,
        grade: metadata.gradeName,
        gradeLevelId,
        sectionLabel: metadata.sectionLabel,
        generatedName: `${metadata.gradeName}-${metadata.sectionLabel}`,
        generatedShortCode: `${metadata.gradeCode.replaceAll("_", "")}-${metadata.sectionLabel}`,
        sectionName: metadata.sectionName,
        shortCode: metadata.shortCode,
        recessAfterSession: recessAfterSession(shortCode),
      },
    });
    classIds.set(shortCode, classSection.id);
  }

  const gradeCurriculumIds = new Map<string, string>();
  const gradeCurriculumSessions = new Map<string, number>();

  for (const detail of allTeacherDetails) {
    const classCode = normalizeClassCode(detail.className);
    const metadata = metadataByClass.get(classCode);
    const classSectionId = classIds.get(classCode);
    const subjectId = subjectIds.get(detail.subject);
    const teacherId = teacherIds.get(detail.teacher);
    if (!metadata || !classSectionId || !subjectId || !teacherId) {
      throw new Error(
        `Cannot seed row ${detail.sourceRow}: unresolved teacher, subject, or class.`,
      );
    }
    const gradeLevelId = gradeLevelIds.get(metadata.gradeCode);
    if (!gradeLevelId) {
      throw new Error(
        `Cannot seed row ${detail.sourceRow}: unresolved grade ${metadata.gradeCode}.`,
      );
    }

    const mainSubject = isMainSubject(detail.subject, detail.hours, metadata);
    const allowDoubleSession = mainSubject;
    const key = curriculumKey(gradeLevelId, subjectId);
    let gradeCurriculumId = gradeCurriculumIds.get(key);
    if (!gradeCurriculumId) {
      const gradeCurriculum = await db.gradeCurriculum.create({
        data: {
          schoolId: ids.school,
          termId: ids.term,
          gradeLevelId,
          subjectId,
          weeklySessions: detail.hours,
          isMainSubject: mainSubject,
          allowDoubleSession,
        },
      });
      gradeCurriculumId = gradeCurriculum.id;
      gradeCurriculumIds.set(key, gradeCurriculumId);
      gradeCurriculumSessions.set(key, detail.hours);
    } else {
      const previousSessions = gradeCurriculumSessions.get(key) ?? 0;
      if (detail.hours > previousSessions) {
        await db.gradeCurriculum.update({
          where: { id: gradeCurriculumId },
          data: {
            weeklySessions: detail.hours,
            isMainSubject: mainSubject,
            allowDoubleSession,
          },
        });
        gradeCurriculumSessions.set(key, detail.hours);
      }
    }

    await db.classCurriculum.create({
      data: {
        schoolId: ids.school,
        termId: ids.term,
        classSectionId,
        gradeCurriculumId,
        subjectId,
        teacherId: null,
        weeklySessions: detail.hours,
        isMainSubject: mainSubject,
        allowDoubleSession,
      },
    });
  }

  for (const detail of allTeacherDetails) {
    const classCode = normalizeClassCode(detail.className);
    const classSectionId = classIds.get(classCode);
    const subjectId = subjectIds.get(detail.subject);
    const teacherId = teacherIds.get(detail.teacher);
    if (!classSectionId || !subjectId || !teacherId) {
      throw new Error(
        `Cannot allocate row ${detail.sourceRow}: unresolved teacher, subject, or class.`,
      );
    }
    await db.classCurriculum.updateMany({
      where: {
        schoolId: ids.school,
        termId: ids.term,
        classSectionId,
        subjectId,
        teacherId: null,
      },
      data: { teacherId },
    });
  }

  for (const combination of sharedTeachingCombinations) {
    const teacherId = teacherIds.get(combination.teacher);
    const subjectId = subjectIds.get(combination.subject);
    if (!teacherId || !subjectId) {
      throw new Error(
        `Cannot create shared group row ${combination.sourceRow}: unresolved teacher or subject.`,
      );
    }

    const anchorClassCode = normalizeClassCode(combination.anchorClassName);
    const sharedClassCodes = combination.sharedClassNames.map((className) =>
      normalizeClassCode(className),
    );
    const memberClassCodes = [anchorClassCode, ...sharedClassCodes];
    const memberClassIds = memberClassCodes.map((classCode) => {
      const classSectionId = classIds.get(classCode);
      if (!classSectionId) {
        throw new Error(
          `Cannot create shared group row ${combination.sourceRow}: unresolved class ${classCode}.`,
        );
      }
      return classSectionId;
    });

    const memberCurricula: SeedSharedCurriculum[] =
      await db.classCurriculum.findMany({
        where: {
          schoolId: ids.school,
          termId: ids.term,
          subjectId,
          classSectionId: { in: memberClassIds },
          isActive: true,
        },
        select: {
          id: true,
          classSectionId: true,
          teacherId: true,
          weeklySessions: true,
          sharedTeachingGroupId: true,
        },
      });
    if (memberCurricula.length !== memberClassIds.length) {
      throw new Error(
        `Cannot create shared group row ${combination.sourceRow}: missing matching curriculum rows.`,
      );
    }
    for (const curriculum of memberCurricula) {
      if (
        curriculum.teacherId !== teacherId ||
        curriculum.weeklySessions !== combination.hours ||
        curriculum.sharedTeachingGroupId
      ) {
        throw new Error(
          `Cannot create shared group row ${combination.sourceRow}: curriculum rows are not eligible.`,
        );
      }
    }

    const sharedGroup = await db.sharedTeachingGroup.create({
      data: {
        schoolId: ids.school,
        termId: ids.term,
        subjectId,
        teacherId,
        weeklySessions: combination.hours,
      },
    });
    await db.classCurriculum.updateMany({
      where: {
        schoolId: ids.school,
        termId: ids.term,
        id: { in: memberCurricula.map((curriculum) => curriculum.id) },
      },
      data: { sharedTeachingGroupId: sharedGroup.id },
    });
  }

  await db.constraintProfile.create({
    data: {
      id: ids.profile,
      schoolId: ids.school,
      termId: ids.term,
      name: "Balanced",
      isDefault: true,
    },
  });

  for (const [code, weight] of [
    ["TEACHER_AVAILABILITY", 20],
    ["FIRST_LAST_PERIOD", 2],
    ["TEACHER_GAP", 12],
    ["PART_TIME_COMPACTNESS", 10],
    ["PART_TIME_DISTRIBUTION_RELAXATION", 10000],
    ["TEACHER_CONSECUTIVE_PREFERENCE", 3],
    ["MAIN_DOUBLE_ADJACENCY", 50],
    ["SUBJECT_SPREAD", 0],
    ["REPEATED_SUBJECT_DAY", 0],
    ["SUBJECT_CONSECUTIVE_PREFERENCE", 8],
    ["LATE_HEAVY_SUBJECT", 4],
    ["MAIN_SUBJECT_LATE_SESSION", 8],
    ["DAILY_WORKLOAD_BALANCE", 2],
  ] as const) {
    await db.constraintWeight.create({
      data: { profileId: ids.profile, code, kind: "SOFT", weight },
    });
  }

  console.log(
    `Al Massar seed created: ${allClasses.length} classes, ${teacherIds.size} teachers, ${subjectIds.size} subjects, ${allTeacherDetails.length} class curriculum rows, ${sharedTeachingCombinations.length} shared teaching groups.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
