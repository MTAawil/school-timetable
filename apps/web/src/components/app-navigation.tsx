"use client";

import {
  BookOpen,
  CalendarRange,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/setup", label: "School setup", icon: Settings2 },
  { href: "/subjects", label: "Curriculum", icon: BookOpen },
  { href: "/teachers", label: "Teachers", icon: Users },
  { href: "/readiness", label: "Generate", icon: ShieldCheck },
  { href: "/schedules", label: "Timetables", icon: CalendarRange },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/schedules") {
    return (
      pathname.startsWith("/schedules") || pathname.startsWith("/generation")
    );
  }
  return pathname === href;
}

export function DesktopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-3" aria-label="Primary">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            key={href}
            href={href}
            className={`flex h-11 items-center gap-3 border-l-2 px-3 text-sm ${
              active
                ? "border-[#55b491] bg-white/10 text-white"
                : "border-transparent text-[#d7e2dd] hover:bg-white/8 hover:text-white"
            }`}
          >
            <Icon aria-hidden="true" size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile primary"
      className="flex overflow-x-auto border-b border-[#dce1dc] bg-white px-2 lg:hidden"
    >
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            key={href}
            href={href}
            className={`flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-medium ${
              active
                ? "border-[#0e6b4f] text-[#0e6b4f]"
                : "border-transparent text-[#56615c]"
            }`}
          >
            <Icon aria-hidden="true" size={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
