/** KURO mark: a waning crescent. Drawn in code — no third-party logos are used anywhere in the app. */
export function Brand({ size = 22 }: { size?: number }) {
  return (
    <span className="brand">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M21.5 4.2A13 13 0 1 0 27.8 21 10.5 10.5 0 1 1 21.5 4.2Z" fill="var(--amber)" />
      </svg>
      <span>KURO</span>
    </span>
  )
}
