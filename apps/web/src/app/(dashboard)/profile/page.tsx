import Link from "next/link"

export default function ProfilePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16 font-sans">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
        ← Home
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
      <p className="text-gray-600">Dashboard stub — load user profile from Supabase when wired.</p>
    </main>
  )
}
