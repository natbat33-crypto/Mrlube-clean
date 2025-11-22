// app/auth/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No guards here — the login/signup pages must always be reachable
  return <>{children}</>;
}