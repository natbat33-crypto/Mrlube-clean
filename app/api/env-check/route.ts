export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || "(missing)",
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "(missing)",
    privateKeyStartsWith: process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.slice(0, 20)
      : "(missing)",
  });
}
