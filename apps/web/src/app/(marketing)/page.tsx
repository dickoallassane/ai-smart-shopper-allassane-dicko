import Link from "next/link"
import { TextLink } from "@/ui/text-link"

export default function MarketingHomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16 font-sans">
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500">ShopFriend</p>
        <h1 className="text-3xl font-semibold text-gray-900">Smart Shopper companion</h1>
        <p className="mt-3 text-lg text-gray-600">
          Landing, authentication, and API routes live here. The Chrome extension talks to this Next.js app for
          insights — see the repo docs for the full architecture.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Link
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          href="/login"
        >
          Sign in
        </Link>
        <Link className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900" href="/api/health">
          API health
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        <TextLink href="/profile">Profile</TextLink>
      </p>
    </main>
  )
}
