/** Original line illustrations used in loading and empty states. They float gently; motion stops for reduced-motion users. */

export function Astronaut({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={'art-astro ' + className} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd7a0" /><stop offset="0.45" stopColor="#f4a259" /><stop offset="1" stopColor="#6a3a1c" />
        </linearGradient>
        <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f4ee" /><stop offset="1" stopColor="#c9c5bb" />
        </linearGradient>
      </defs>
      <g className="art-float">
        {/* tether */}
        <path d="M30 74 C 12 86, 10 104, 2 116" fill="none" stroke="#8b8df0" strokeWidth="1.6" strokeDasharray="3 4" opacity="0.7" />
        {/* backpack */}
        <rect x="34" y="44" width="44" height="40" rx="8" fill="#b8b3a8" />
        {/* legs */}
        <rect x="46" y="80" width="11" height="24" rx="5" fill="url(#suit)" transform="rotate(8 51 80)" />
        <rect x="62" y="80" width="11" height="24" rx="5" fill="url(#suit)" transform="rotate(-12 67 80)" />
        <rect x="47" y="100" width="13" height="7" rx="3" fill="#3b3d45" transform="rotate(8 51 80)" />
        <rect x="63" y="100" width="13" height="7" rx="3" fill="#3b3d45" transform="rotate(-12 67 80)" />
        {/* torso */}
        <rect x="40" y="50" width="40" height="36" rx="12" fill="url(#suit)" />
        <rect x="52" y="62" width="16" height="10" rx="2" fill="#dcd8cf" />
        <rect x="55" y="65" width="4" height="2" fill="#f4a259" /><rect x="61" y="65" width="4" height="2" fill="#6fa8ff" />
        {/* arms: left reaches out, right waves */}
        <rect x="24" y="56" width="22" height="10" rx="5" fill="url(#suit)" transform="rotate(-18 40 60)" />
        <circle cx="24" cy="66" r="5" fill="#3b3d45" />
        <g className="art-wave">
          <rect x="74" y="44" width="10" height="22" rx="5" fill="url(#suit)" transform="rotate(28 78 62)" />
          <circle cx="87" cy="44" r="5" fill="#3b3d45" />
        </g>
        {/* helmet */}
        <circle cx="60" cy="38" r="20" fill="url(#suit)" />
        <ellipse cx="62" cy="38" rx="14" ry="11" fill="url(#visor)" />
        <path d="M53 33 q 5 -5 12 -3" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.75" />
      </g>
    </svg>
  )
}

export function Satellite({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={'art-sat ' + className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <g className="art-orbit">
        <g transform="translate(20 6) rotate(30)">
          <rect x="-12" y="-2.5" width="8" height="5" rx="1" fill="#2f5bd0" />
          <rect x="4" y="-2.5" width="8" height="5" rx="1" fill="#2f5bd0" />
          <rect x="-4" y="-3.5" width="8" height="7" rx="1.5" fill="#e0b04f" />
          <path d="M0 -3.5 l0 -3" stroke="#e8e6f5" strokeWidth="1" />
        </g>
      </g>
      <circle cx="20" cy="20" r="6" fill="#cfcbc1" />
      <circle cx="18" cy="18" r="1.4" fill="#a39f95" /><circle cx="22.5" cy="21.5" r="1" fill="#a39f95" />
    </svg>
  )
}
