// scripts/syncClaimsFromUsers.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// 1) Load service account from project root
const credPath = path.join(process.cwd(), "service-account.json");
if (!fs.existsSync(credPath)) {
  console.error("❌ Missing service-account.json at project root.");
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));

// 2) Init admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
  });
}
const db = admin.firestore();
const auth = admin.auth();

// 3) Copy role/storeId from users collection → custom claims
(async () => {
  try {
    const snap = await db.collection("users").get();
    let ok = 0, fail = 0;

    for (const doc of snap.docs) {
      const uid = doc.id;
      const data = doc.data() || {};
      const role = data.role;
      const storeId = data.storeId;

      if (!role || !storeId) {
        console.warn(`⚠️  Skipping ${uid} (missing role/storeId)`);
        fail++;
        continue;
      }

      await auth.setCustomUserClaims(uid, { role, storeId });
      console.log(`✅ Set claims for ${uid}:`, { role, storeId });
      ok++;
    }

    console.log(`\nDone. Updated: ${ok}, Skipped/Failed: ${fail}`);
    process.exit(0);
  } catch (e) {
    console.error("❌ Fatal:", e);
    process.exit(1);
  }
})();

