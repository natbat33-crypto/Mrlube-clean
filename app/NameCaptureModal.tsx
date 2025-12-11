"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function NameCaptureModal() {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Check if user needs a name
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOpen(false);
        return;
      }

      setUid(user.uid);

      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data() || {};

      // If user already has a name → do nothing
      if (data.name && data.name.trim() !== "") {
        setOpen(false);
        return;
      }

      // Otherwise show modal
      setOpen(true);
    });

    return () => unsub();
  }, []);

  async function saveName() {
    if (!uid) return;
    const clean = name.trim();
    if (!clean) return;

    await setDoc(
      doc(db, "users", uid),
      { name: clean },
      { merge: true }
    );

    setOpen(false);
  }

  // Do not render anything if modal shouldn't show
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
        <h2 className="text-lg font-semibold">Enter Your Name</h2>

        <p className="text-sm text-gray-600">
          Please enter your name so it appears on notes and dashboards.
        </p>

        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />

        <button
          onClick={saveName}
          disabled={!name.trim()}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Save Name
        </button>
      </div>
    </div>
  );
}
