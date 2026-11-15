// Primary site navigation, shared by the landing page and the site pages (Data, About).
// The Explorer has its own workspace rail and is not changed by this.
export const SITE_NAV = [
  { to: '/', label: 'Home' },
  { to: '/explorer', label: 'Explorer' },
  { to: '/compare', label: 'Compare' },
  { to: '/data', label: 'Data' },
  { to: '/about', label: 'About us' },
] as const
