"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { useParams } from "next/navigation";

export default function ManagerStorePage() {
  const params = useParams();
  const storeId = String(params?.id || "");

  return (
    <main style={{
      padding: "40px",
      fontSize: "22px",
      color: "black",
      background: "white"
    }}>
      <h1>🟦 STORE PAGE LOADED</h1>
      <p>storeId: <b>{storeId}</b></p>

      <p style={{marginTop: "20px"}}>
        If you see this text, the route works.
        <br/>If you STILL see a white screen, the route never renders.
      </p>
    </main>
  );
}
