"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

function makeToken() {
  return crypto.randomUUID();
}

export default function AdminInvitesPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState("");

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    setLink("");

    if (!email.includes("@")) {
      setStatus("Enter a valid email.");
      return;
    }

    const token = makeToken();

    await setDoc(doc(db, "invites", token), {
      email: email.trim().toLowerCase(),
      role,
      used: false,
      disabled: false,
      createdAt: serverTimestamp(),
    });

    const inviteLink = `${window.location.origin}/invite/${token}`;

    // Send email through Firebase mail collection
    await addDoc(collection(db, "mail"), {
      to: [email.trim().toLowerCase()],
      message: {
        subject: "You're Invited to Mr. Lube Training",
        html: `
          <h2>Welcome to Mr. Lube Training</h2>
          <p>You have been invited to create your account.</p>
          <p><strong>Role:</strong> ${role}</p>
          <p>
            <a href="${inviteLink}">
              Click here to accept your invite
            </a>
          </p>
        `,
      },
    });

    setLink(inviteLink);
    setStatus("Invite created and email sent.");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Create Invite</h1>

        <form onSubmit={createInvite} className="grid gap-4">
          <input
            type="email"
            placeholder="Employee email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-lg p-3"
            required
          />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border rounded-lg p-3"
          >
            <option value="employee">Employee / Trainee</option>
            <option value="manager">Manager</option>
            <option value="gm">General Manager</option>
            <option value="admin">Admin</option>
          </select>

          <button className="bg-blue-700 text-white rounded-lg py-3 font-bold">
            Generate & Send Invite
          </button>
        </form>

        {status && <p className="mt-4">{status}</p>}

        {link && (
          <div className="mt-4 border rounded-lg p-3 bg-gray-50">
            <p className="font-semibold mb-2">Invite Link:</p>
            <p className="break-all text-blue-700">{link}</p>

            <button
              onClick={() => navigator.clipboard.writeText(link)}
              className="mt-3 bg-black text-white rounded-lg px-4 py-2"
            >
              Copy Link
            </button>
          </div>
        )}
      </div>
    </main>
  );
}