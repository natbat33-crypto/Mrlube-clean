// scripts/setClaims.js
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// --- service account at project root ---
const credPath = path.join(process.cwd(), 'service-account.json');
if (!fs.existsSync(credPath)) {
  throw new Error('Missing service-account.json at project root.');
}
const serviceAccount = require(credPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const auth = admin.auth();

/**
 * Set custom claims for a single user by email.
 * role ∈ 'admin' | 'manager' | 'supervisor' | 'employee'
 * storeId is a STRING e.g. "24"
 */
async function setClaims(email, role, storeId) {
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role, storeId });
  console.log(`✔ claims set for ${email}: { role: "${role}", storeId: "${storeId}" }`);
}

async function main() {
  // TODO: change these to real accounts you use
  await setClaims('admin-test@example.com',       'admin',     '24');
  await setClaims('manager-example@mrlube.com',   'manager',   '24');
  await setClaims('supervisor-test@example.com',  'supervisor','24');
  await setClaims('employee-example@mrlube.com',  'employee',  '24');
}

main().then(() => {
  console.log('All done.');
  process.exit(0);
}).catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});

