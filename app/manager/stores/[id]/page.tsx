"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { useParams } from "next/navigation";

export default function ManagerStorePage() {
  const { id } = useParams();

  return (
    <main style={{ padding: 40, fontSize: 22 }}>
      <h1>STORE PAGE LOADED</h1>
      <p>Store ID: {String(id)}</p>
    </main>
  );
}
