import { AppShell } from "@/components/app-shell";
import { verifySession } from "@/lib/auth/dal";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await verifySession();

  return (
    <AppShell schoolName={user.school.name} userName={user.name}>
      {children}
    </AppShell>
  );
}
