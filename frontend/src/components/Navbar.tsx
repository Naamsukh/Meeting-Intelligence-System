"use client";

import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

export default function Navbar({ email }: { email?: string }) {
  const router = useRouter();

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm text-white">
            MI
          </span>
          Meeting Intelligence
        </a>
        <div className="flex items-center gap-3 text-sm">
          {email && <span className="text-slate-500">{email}</span>}
          <button className="btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
