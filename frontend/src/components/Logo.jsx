export default function Logo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 13c3-6 8-9 13-9-1 3-1 5 1 6-2 1-4 1-6 0 1 2 3 3 6 3-3 3-8 4-11 2 1 2 3 3 5 3-4 1-8 0-8-5z"
        fill="var(--accent)"
      />
    </svg>
  )
}
