import Link from "next/link"
import { ExtensionConnectPanel } from "@/features/auth/extension-connect"

export default function ExtensionConnectPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-16 font-sans">
      <div>
        <Link href="/login" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to sign in
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">Connect extension</h1>
        <p className="mt-2 text-sm text-gray-600">
          Link this browser session to the Chrome extension (token / one-time code flow). See{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">apps/web/docs/extension-auth-flow.md</code>.
        </p>
      </div>
      <ExtensionConnectPanel />
    </main>
  )
}
