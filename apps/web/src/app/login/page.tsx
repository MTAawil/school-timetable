import { redirect } from "next/navigation";
import { getDatabase } from "@school-timetable/database";

import { readSession } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await readSession();
  if (session) {
    const user = await getDatabase().user.findFirst({
      where: {
        id: session.userId,
        schoolId: session.schoolId,
        role: "ADMIN",
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f3f5f1] lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="hidden bg-[#18342b] px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="text-sm font-semibold">School Timetable</p>
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight">
            Build the school week with clear rules.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[#c7d7d0]">
            Administrative scheduling workspace for Cedars Secondary School.
          </p>
        </div>
        <p className="text-sm text-[#9fb5ac]">Single-school administration</p>
      </section>
      <section className="flex items-center bg-white px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <p className="text-sm font-semibold text-[#0e6b4f]">
            School Timetable
          </p>
          <h2 className="mt-3 text-3xl font-semibold">Administrator sign in</h2>
          <p className="mt-2 text-sm leading-6 text-[#66706b]">
            Use the administrator account configured for this school.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
