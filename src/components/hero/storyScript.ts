// "Thirteen Hours" — chapter content for the scroll story in the landing hero.
//
// `from` / `to` are positions in story progress (0–1). The scene (Earth, Sun, rover face)
// is keyed to story progress, so these windows line up with the visuals. How much *scroll*
// each window gets comes from `weight` (≈ seconds of comfortable reading), see SEGMENTS.
//
// `dialogue` lines are fictional narration by the KURO rover character, not recordings
// from the Athena mission. Facts follow the project's mission context (IM-2 Athena, March
// 2025); verify against an authoritative source before publishing.

export interface Fact { k: string; v: string }

// ---- KURO telemetry (simulated) ---------------------------------------------------------
// KURO is a fictional storytelling rover. These readings are ILLUSTRATIVE demo values that
// dramatise the story; they are not recorded Athena data and are labelled as simulated in
// the UI. Numbers tween between chapter states; statuses switch mid-tween.
export type Level = 'ok' | 'warn' | 'crit'
export interface Telemetry {
  battery: number   // %
  solar: number     // W
  temp: number      // °C (system)
  comm: [string, Level]
  drive: [string, Level]
  mode: [string, Level]
  traction: [string, Level]
  light: [string, Level]
}
export interface Chapter {
  n: string
  name: string            // chapter name (small label)
  title: string           // editorial heading
  side: 'left' | 'right'  // which side the chapter text sits on
  from: number
  to: number
  weight: number
  paras: string[]
  facts?: Fact[]
  note?: string
  dialogue: string
  drive: number          // where the rover stops in this chapter (0 = start, 1 = closest)
  telemetry: Telemetry   // state the panel settles into once the rover has stopped
}

export const CHAPTERS: Chapter[] = [
  {
    n: '01', name: 'The Dream', title: 'A ten-day ambition', side: 'left', from: 0, to: 0.15, weight: 2.6,
    paras: [
      'In March 2025, Intuitive Machines sent its Athena lander towards the lunar South Pole — a region of deep craters, high ridges and sunlight that barely clears the horizon.',
      'The ambition was clear: reach the surface, operate through the lunar environment and make the most of every hour of a mission planned for about ten days.',
    ],
    facts: [{ k: 'Lander', v: 'IM-2 Athena' }, { k: 'Target', v: 'Mons Mouton' }, { k: 'Planned', v: '~10 days' }],
    dialogue: 'Ten days. That was the plan. A whole new world waiting to be explored.',
    drive: 0.12,
    telemetry: { battery: 97, solar: 92, temp: -8, comm: ['Link nominal', 'ok'], drive: ['Driving', 'ok'], mode: ['Nominal', 'ok'], traction: ['Nominal', 'ok'], light: ['Sunrise', 'ok'] },
  },
  {
    n: '02', name: 'The Landing', title: 'The landing', side: 'right', from: 0.15, to: 0.3, weight: 2.6,
    paras: [
      'On March 6, 2025, Athena reached the lunar surface in the Mons Mouton region of the South Pole.',
      'But the landing was not as planned. The lander came down roughly 250 metres from its intended site, inside a crater, and came to rest on its side.',
    ],
    facts: [{ k: 'Date', v: '06.03.2025' }, { k: 'Offset', v: '~250 m' }, { k: 'Attitude', v: 'On its side' }],
    dialogue: "Athena made it to the Moon. But it didn't land quite where it was supposed to.",
    drive: 0.30,
    telemetry: { battery: 95, solar: 118, temp: -4, comm: ['Earth in view', 'ok'], drive: ['Driving', 'ok'], mode: ['Nominal', 'ok'], traction: ['Nominal', 'ok'], light: ['Low Sun', 'ok'] },
  },
  {
    n: '03', name: 'A Difficult Surface', title: 'More than just a landing', side: 'left', from: 0.3, to: 0.48, weight: 2.6,
    paras: [
      'On Earth, a small change in position may not mean much. On the Moon, it can change everything.',
      "A slope can affect a lander's orientation. A crater rim can block sunlight. The surrounding terrain shapes what a spacecraft can see and communicate with.",
    ],
    note: 'Terrain · Slope · Craters · Local horizon',
    dialogue: 'Look around. These rocks, slopes and craters can change the outcome of an entire mission.',
    drive: 0.50,
    telemetry: { battery: 91, solar: 126, temp: -2, comm: ['Link nominal', 'ok'], drive: ['Rough terrain', 'warn'], mode: ['Nominal', 'ok'], traction: ['Slip 14%', 'warn'], light: ['Partial shadow', 'warn'] },
  },
  {
    n: '04', name: 'The Sun Is Everything', title: 'The Sun is everything', side: 'right', from: 0.48, to: 0.65, weight: 2.6,
    paras: [
      'At the lunar South Pole the Sun never climbs high. It circles close to the horizon, casting long shadows across the terrain.',
      'For a solar-powered spacecraft, sunlight is not just a view — it is a resource. Where a lander rests, which way it faces and what blocks the light decide how long it can operate.',
    ],
    facts: [{ k: 'Highest Sun at the pole', v: '~1.5°' }, { k: 'Power', v: 'No sunlight, no recharge' }],
    dialogue: 'I need sunlight to keep going. Out here, even a nearby ridge can take that away.',
    drive: 0.65,
    telemetry: { battery: 88, solar: 164, temp: 4, comm: ['Link nominal', 'ok'], drive: ['Holding', 'ok'], mode: ['Low-power watch', 'warn'], traction: ['Nominal', 'ok'], light: ['Peak · low arc', 'ok'] },
  },
  {
    n: '05', name: 'The Light Begins to Leave', title: 'The light begins to leave', side: 'left', from: 0.65, to: 0.82, weight: 2.6,
    paras: [
      'As the Sun drifts towards the horizon, shadows lengthen and the margin for operation narrows. Power must be managed carefully.',
      'Ground that was lit moments ago can fall into shadow, and a nearby ridge can make the difference. On the Moon, the horizon is not scenery — it decides whether sunlight arrives at all.',
    ],
    note: 'Every hour of sunlight matters',
    dialogue: 'The shadows are getting longer. I can feel the available energy running low.',
    drive: 0.82,
    telemetry: { battery: 41, solar: 36, temp: -27, comm: ['Intermittent', 'warn'], drive: ['Reduced speed', 'warn'], mode: ['Power saving', 'warn'], traction: ['Nominal', 'ok'], light: ['Shadows lengthening', 'warn'] },
  },
  {
    n: '06', name: 'Thirteen Hours', title: 'Thirteen hours', side: 'right', from: 0.82, to: 0.9, weight: 3.6,
    paras: [
      "Athena's surface operations came to an end after approximately thirteen hours.",
      'Ten days had been the expectation. Thirteen hours became the reality — a reminder that reaching the Moon is one challenge, and surviving its environment is another.',
    ],
    facts: [{ k: 'Planned', v: '10 days' }, { k: 'Achieved', v: '~13 hours' }],
    dialogue: 'Ten days were expected. Thirteen hours became the reality. I wish the story had lasted longer.',
    drive: 1,
    telemetry: { battery: 6, solar: 0, temp: -58, comm: ['Link lost', 'crit'], drive: ['Stopped', 'crit'], mode: ['Standby', 'crit'], traction: ['Locked', 'warn'], light: ['No sunlight', 'crit'] },
  },
  {
    n: '07', name: 'The Question That Remains', title: 'What if we looked before we landed?', side: 'left', from: 0.9, to: 1, weight: 3.4,
    paras: [
      'A successful lunar mission does not begin at touchdown. It begins with the place we choose.',
    ],
    dialogue: 'What if we understood the terrain, sunlight and shadows before choosing where to land?',
    drive: 1,
    telemetry: { battery: 3, solar: 0, temp: -71, comm: ['No signal', 'crit'], drive: ['Stopped', 'crit'], mode: ['Critical standby', 'crit'], traction: ['Locked', 'warn'], light: ['Night', 'crit'] },
  },
]

// final call to action, revealed at the end of chapter 07
export const CTA = {
  text: 'Explore the terrain. Understand the sunlight. Find a better place to land.',
  label: 'Explore the lunar South Pole',
  to: '/explorer',
  from: 0.975,
}

// scroll budget per story window: story progress window + relative scroll length
export const SEGMENTS = CHAPTERS.map((c) => ({ from: c.from, to: c.to, weight: c.weight }))
