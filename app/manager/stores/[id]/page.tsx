"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
import { useParams } from "next/navigation";

// TEMP HACK:
console.log("STORE PAGE BOOTING");


export default function StorePage() {
  const { id } = useParams();
  return (
    <div style={{ padding: 40 }}>
      <h1>STORE PAGE LOADED</h1>
      <p>ID: {String(id)}</p>
    </div>
  );
}
