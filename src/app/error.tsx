"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center p-8 text-center flex-col gap-4">
      <h2 className="text-xl font-bold text-red-600">Something went wrong!</h2>
      <pre className="text-sm bg-slate-100 p-4 rounded-xl text-left overflow-auto max-w-full text-slate-800">
        {error.message || "Unknown error"}
      </pre>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
      >
        Try again
      </button>
    </div>
  );
}
