'use client'
import Link from 'next/link'

export default function SignOutButton() {
  // Render a plain Link so no parent click handler can hijack it.
  return (
    <Link
      href="/auth/logout"
      className="text-sm text-gray-600 hover:text-blue-600 transition"
    >
      Sign out
    </Link>
  )
}



