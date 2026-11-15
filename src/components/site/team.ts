// The KURO team, shown on the About page. Add a `role` (e.g. "Explorer & 3D engine")
// to any member and it appears under their name.
export interface Member { name: string; role?: string }

export const TEAM: Member[] = [
  { name: 'Srejoy Saha' },
  { name: 'Sarthak Kumar Sharma' },
  { name: 'Hario Om' },
  { name: 'Amandeep Singh Oberai' },
  { name: 'Prateek Panditrao Gore' },
  { name: 'Arnav Rajvanshi' },
]

export const initials = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
