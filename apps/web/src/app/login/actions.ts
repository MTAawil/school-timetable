"use server";

import { compare } from "bcryptjs";
import { getDatabase } from "@school-timetable/database";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, deleteSession } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type LoginState = {
  error?: string;
};

export async function login(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const input = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!input.success) {
    return { error: "Enter a valid email address and password." };
  }

  const user = await getDatabase().user.findFirst({
    where: {
      email: input.data.email,
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
    },
  });
  if (!user || !(await compare(input.data.password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }

  await createSession({
    userId: user.id,
    schoolId: user.schoolId,
    role: "ADMIN",
  });
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
