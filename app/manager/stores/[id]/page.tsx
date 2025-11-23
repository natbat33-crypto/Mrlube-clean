"use client";
import { useParams } from "next/navigation";

export default function StorePage() {
  const { id } = useParams();
  return (
    <div style={{ padding: 40 }}>
      <h1>STORE PAGE LOADED</h1>
      <p>ID: {String(id)}</p>
    </div>
  );
}
