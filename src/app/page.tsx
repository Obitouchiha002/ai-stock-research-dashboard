"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center p-8 bg-slate-50">
      <div className="animate-pulse text-slate-500 font-medium">
        Redirecting to Dashboard...
      </div>
    </div>
  );
}
