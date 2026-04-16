type SmileLogoProps = {
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

/** Simple smile mark; inherits `currentColor` from parent */
export const SmileLogo = ({ className = 'h-6 w-6', 'aria-hidden': ariaHidden = true }: SmileLogoProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={ariaHidden === true || ariaHidden === 'true' ? true : ariaHidden === false ? false : undefined}
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M8 14c1.2 1.6 2.9 2.5 4 2.5s2.8-.9 4-2.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <circle cx="9" cy="10" r="1.1" fill="currentColor" />
    <circle cx="15" cy="10" r="1.1" fill="currentColor" />
  </svg>
)
