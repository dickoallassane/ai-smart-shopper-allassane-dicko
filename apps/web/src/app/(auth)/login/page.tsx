"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase-browser"

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (!supabase) {
      setStatus("error")
      setMessage("Supabase is not configured. Copy apps/web/.env.example to apps/web/.env.local and add keys.")
      return
    }

    setStatus("sending")
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` }
    })

    if (error) {
      setStatus("error")
      setMessage(error.message)
      return
    }

    setStatus("sent")
    setMessage("Check your email for the magic link.")
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16 font-sans">
      <div>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">Sign in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Supabase magic link (OTP). After signing in, use the extension connect flow described in{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">apps/web/docs/extension-auth-flow.md</code>.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="text-sm font-medium text-gray-800" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {status === "sending" ? "Sending…" : "Send magic link"}
        </button>
      </form>

      {message ? <p className="text-sm text-gray-700">{message}</p> : null}
      {status === "sent" ? (
        <p className="text-sm text-green-700">If email delivery is configured in Supabase, you should receive a link shortly.</p>
      ) : null}
    </main>
  )
}
