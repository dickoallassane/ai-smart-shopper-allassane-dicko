import Link from "next/link"
import type { ComponentProps } from "react"

type TextLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  className?: string
}

/** Small styled Next.js `Link` for marketing and dashboard stubs. */
export const TextLink = ({ className, ...props }: TextLinkProps) => (
  <Link
    {...props}
    className={`text-sm text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline ${className ?? ""}`}
  />
)
