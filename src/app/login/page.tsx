"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { supabaseSyncNow } from "@/lib/supabaseSync";

// Real login/signup (Supabase Auth). One account, same data on every device.
// After login we immediately run a sync — the first one uploads whatever data is
// already on this device to the account, so nothing is lost when migrating.
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok" | "info"; text: string } | null>(null);
  const [ready, setReady] = useState(false);

  // Already logged in? Skip straight to the app.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
      else setReady(true);
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const sb = getSupabase();
    if (!sb) { setMsg({ kind: "err", text: "Login is not configured yet." }); return; }
    const mail = email.trim().toLowerCase();
    if (!mail || password.length < 6) {
      setMsg({ kind: "err", text: "Enter your email and a password (min 6 characters)." });
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email: mail, password });
        if (error) throw error;
        // If email confirmation is off, a session exists now; else ask to verify.
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          setMsg({ kind: "ok", text: "Account banaya ✓ Agar confirmation email aaye to verify karke login karein." });
          setMode("login");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
      }
      // Logged in — upload/merge this device's existing data into the account.
      setMsg({ kind: "info", text: "Syncing your data…" });
      await supabaseSyncNow();
      router.replace("/dashboard");
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Something went wrong. Try again." });
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-[#0a1029] via-[#141d40] to-[#20264d] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-7">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-amber-500 grid place-items-center text-white font-black">S</div>
          <div className="text-xl font-black text-slate-900">Stock<span className="text-amber-500">Analytix</span></div>
        </div>
        <h1 className="text-lg font-bold text-slate-900 mt-3">
          {mode === "login" ? "Log in" : "Create your account"}
        </h1>
        <p className="text-sm text-slate-500 mb-5">
          One account — your portfolio, watchlist, Markets & alerts stay the same on every device.
        </p>

        {!supabaseConfigured() && (
          <div className="mb-4 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
            Login is not configured on this deployment yet.
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        {msg && (
          <div className={`mt-3 text-sm rounded-lg px-3 py-2 border ${
            msg.kind === "err" ? "bg-rose-50 border-rose-200 text-rose-700"
            : msg.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-slate-50 border-slate-200 text-slate-600"}`}>
            {msg.text}
          </div>
        )}

        <div className="mt-5 text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>New here? <button className="text-indigo-600 font-semibold" onClick={() => { setMode("signup"); setMsg(null); }}>Create an account</button></>
          ) : (
            <>Already have an account? <button className="text-indigo-600 font-semibold" onClick={() => { setMode("login"); setMsg(null); }}>Log in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
