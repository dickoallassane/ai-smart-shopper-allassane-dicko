import { redirect } from "next/navigation"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Legacy URL alias: bookmarks and older redirects used `/sign-in`. */
export default async function SignInAliasPage({ searchParams }: PageProps) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      qs.set(key, value)
    } else if (Array.isArray(value) && value[0]) {
      qs.set(key, value[0])
    }
  }
  const query = qs.toString()
  redirect(query ? `/login?${query}` : "/login")
}
