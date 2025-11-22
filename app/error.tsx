// app/error.tsx
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
    console.error("GlobalError:", error);
  }, [error]);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        Something went wrong
      </h1>
      <p style={{ color: "#556070", marginBottom: 16 }}>
        The page crashed. The exact error is in the browser console so we can fix it fast.
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "#0b53a6",
          color: "#fff",
          fontWeight: 800,
          border: "none",
          borderRadius: 10,
          padding: "10px 16px",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
      <a href="/debug" style={{ marginLeft: 12, color: "#0b53a6", fontWeight: 700 }}>
        Open /debug
      </a>
    </div>
  );
}

