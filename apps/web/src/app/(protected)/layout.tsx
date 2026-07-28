import { AppShell } from "@/components/app-shell";
import { verifySession } from "@/lib/auth/dal";
import { getWorkflowSteps } from "@/lib/workflow";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await verifySession();
  const workflowSteps = await getWorkflowSteps(user.schoolId);

  return (
    <AppShell
      schoolName={user.school.name}
      userName={user.name}
      workflowSteps={workflowSteps}
    >
      {children}
    </AppShell>
  );
}
