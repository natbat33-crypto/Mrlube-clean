'use client'
import { useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      try { await signOut(auth) } finally {
        window.location.replace('/auth/login')
      }
    })()
  }, [])

  return <main className="p-6 text-sm text-gray-600">Signing you out…</main>
}
