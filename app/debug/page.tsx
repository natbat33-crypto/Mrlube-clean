export default function Debug() {
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "(missing)";
  const k = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "").slice(0,6);
  return <pre style={{padding:16}}>
    {`NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${pid}\nAPIKEY starts: ${k}`}
  </pre>;
}
