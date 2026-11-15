/**
 * The KURO rover's dot-matrix face, drawn over the screen in /compare/rover-front.webp so it can blink and talk.
 * Position and pixel grid were measured from that image (screen interior x 386–553, y 62–135 of 768×512).
 */
const EYE = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => [i, j] as const))
const SMILE: [number, number][] = [[13, 13], [14, 14], [15, 15], ...Array.from({ length: 15 }, (_, k) => [16 + k, 16] as [number, number]), [31, 15], [32, 14], [33, 13]]
const OPEN: [number, number][] = [
  ...Array.from({ length: 9 }, (_, k) => [19 + k, 13] as [number, number]),
  ...Array.from({ length: 9 }, (_, k) => [19 + k, 17] as [number, number]),
  [18, 14], [18, 15], [18, 16], [28, 14], [28, 15], [28, 16],
]
const px = (x: number, y: number, k: string) => <rect key={k} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} />

export function RoverFace({ talking }: { talking: boolean }) {
  return (
    <svg className={'rface' + (talking ? ' talking' : '')} viewBox="0 0 46 20" preserveAspectRatio="none" aria-hidden="true">
      <rect className="rface-bg" x="0" y="0" width="46" height="20" />
      <g className="rface-eyes">
        {EYE.map(([i, j]) => px(11.5 + i, 3.5 + j, `l${i}${j}`))}
        {EYE.map(([i, j]) => px(30 + i, 3.5 + j, `r${i}${j}`))}
      </g>
      <g className="rface-smile">{SMILE.map(([x, y]) => px(x, y, `s${x}-${y}`))}</g>
      <g className="rface-open">{OPEN.map(([x, y]) => px(x, y, `o${x}-${y}`))}</g>
    </svg>
  )
}

/** The front-view rover with its live face. */
export function GuideRover({ talking }: { talking: boolean }) {
  return (
    <div className="grover">
      <img src={`${import.meta.env.BASE_URL}compare/rover-front.webp`} alt="KURO, the rover guide" width={768} height={512} />
      <RoverFace talking={talking} />
    </div>
  )
}
