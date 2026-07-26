import {
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  DoorOpen,
  Grid3X3,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  Settings2,
  Users,
} from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/login/actions";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/setup", label: "Setup overview", icon: Settings2 },
  { href: "/settings/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/teachers", label: "Teachers", icon: Users },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/classes", label: "Classes", icon: Building2 },
  { href: "/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/requirements", label: "Requirements", icon: ClipboardList },
  { href: "/availability", label: "Availability", icon: Grid3X3 },
  { href: "/readiness", label: "Readiness", icon: ShieldCheck },
  { href: "/schedules", label: "Timetables", icon: CalendarRange },
  {
    href: "/settings/constraints",
    label: "Quality weights",
    icon: SlidersHorizontal,
  },
];

export function AppShell({
  children,
  schoolName,
  userName,
}: {
  children: React.ReactNode;
  schoolName: string;
  userName: string;
}) {
  return (
    <div className="min-h-screen bg-[#f5f6f3] text-[#18201d]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#dce1dc] bg-[#132b24] text-white lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-sm font-semibold">School Timetable</p>
          <p className="mt-1 truncate text-xs text-[#a9beb5]">{schoolName}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Primary">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex h-10 items-center gap-3 px-3 text-sm text-[#d7e2dd] hover:bg-white/8 hover:text-white"
            >
              <Icon aria-hidden="true" size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <p className="truncate px-3 pb-2 text-xs text-[#a9beb5]">
            {userName}
          </p>
          <form action={logout}>
            <button
              className="flex h-10 w-full items-center gap-3 px-3 text-sm text-[#d7e2dd] hover:bg-white/8 hover:text-white"
              type="submit"
            >
              <LogOut aria-hidden="true" size={17} />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="border-b border-[#dce1dc] bg-white px-5 py-4 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-medium text-[#56615c]">{schoolName}</p>
          </div>
        </header>
        <nav
          aria-label="Mobile primary"
          className="flex overflow-x-auto border-b border-[#dce1dc] bg-white px-2 lg:hidden"
        >
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex h-12 shrink-0 items-center gap-2 px-3 text-xs font-medium text-[#56615c]"
            >
              <Icon aria-hidden="true" size={15} />
              {label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-7xl px-5 py-7 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
