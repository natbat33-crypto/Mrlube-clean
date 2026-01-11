export const dynamic = "force-dynamic";

export default function EmployeePendingPage() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">
          Waiting for assignment
        </h1>

        <p className="text-sm text-gray-600">
          You&apos;re not assigned to a store yet.
          <br />
          A manager or GM will assign you shortly.
        </p>

        <div className="flex justify-center pt-4">
          <a
            href="/auth/logout"
            className="text-sm underline"
          >
            Log out
          </a>
        </div>
      </div>
    </div>
  );
}
