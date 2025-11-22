import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

export async function syncRosterOnce() {
  try {
    const fns = getFunctions(getApp(), "us-central1");
    const call = httpsCallable(fns, "syncRoster");
    await call(); // { ok: true }
    // console.debug("[syncRoster] ok");
  } catch (e) {
    console.error("[syncRoster] failed:", e);
  }
}
