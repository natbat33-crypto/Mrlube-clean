"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { useParams } from "next/navigation";

export default function ManagerStorePage() {
  const params = useParams();
  const storeId = String(params?.id || "");

  return (
    <main style={{ padding: 40, background: "white", fontSize: 22 }}>
      <h1>✅ STORE PAGE LOADED</h1>
      <p>Store ID: <b>{storeId}</b></p>

      <div style={{ marginTop: 20, padding: 10, background: "#eef" }}>
        <p>This confirms the route is rendering.</p>
        <p>If this does NOT show, something outside this file is blocking render.</p>
      </div>
    </main>
  );
}
