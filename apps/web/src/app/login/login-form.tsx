"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="mt-2 h-11 w-full border border-[#cfd5d1] bg-white px-3 text-sm outline-none focus:border-[#0e6b4f] focus:ring-2 focus:ring-[#0e6b4f]/15"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          className="mt-2 h-11 w-full border border-[#cfd5d1] bg-white px-3 text-sm outline-none focus:border-[#0e6b4f] focus:ring-2 focus:ring-[#0e6b4f]/15"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? (
        <p className="border-l-2 border-[#bd2c2c] bg-[#fff5f4] px-3 py-2 text-sm text-[#8e2020]">
          {state.error}
        </p>
      ) : null}
      <button
        className="flex h-11 w-full items-center justify-center gap-2 bg-[#0e6b4f] px-4 text-sm font-semibold text-white hover:bg-[#0b5b43] disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        <LogIn aria-hidden="true" size={17} />
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
