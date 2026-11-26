// The body actions a character can perform inside a shot (no three.js here: the server imports this file too, so
// Claude's shot director, the Stage 4 editor and the 3D engine all agree on what each kind of rig can do).
// rig: 'biped' = two-legged rig (arms, legs, head), 'quad' = four-legged rig (legs, head, ears, tail), 'any' = any rig with a head.
// The moves themselves are built in MoveMaker.js (same ids).
export const MOVE_CATALOG = [
  // two-legged
  { id: 'wave', rig: 'biped', label: 'Wave hello', seconds: 2.4, desc: 'raises one hand and waves (hand: right|left)' },
  { id: 'clap', rig: 'biped', label: 'Clap', seconds: 2, desc: 'claps hands in front of the chest' },
  { id: 'cheer', rig: 'biped', label: 'Cheer (hooray!)', seconds: 2.4, desc: 'both arms up with a little bounce' },
  { id: 'jump', rig: 'biped', label: 'Jump', seconds: 1.2, desc: 'crouches and jumps up on the spot' },
  { id: 'hop', rig: 'biped', label: 'Happy hops', seconds: 2, desc: 'small playful hops on the spot' },
  { id: 'dance', rig: 'biped', label: 'Dance sway', seconds: 3.6, desc: 'side-to-side dance steps with swinging arms' },
  { id: 'bow', rig: 'biped', label: 'Bow', seconds: 2, desc: 'polite bow from the waist' },
  { id: 'lookUp', rig: 'biped', label: 'Look up & point', seconds: 2.5, desc: 'looks up and points at the sky (hand: right|left)' },
  { id: 'stretch', rig: 'biped', label: 'Stretch & yawn', seconds: 3, desc: 'arms up, big stretch' },
  { id: 'greet', rig: 'biped', label: 'Reach out a hand (greeting)', seconds: 2.4, desc: 'reaches the right hand forward as if to shake hands, small nod' },
  // four-legged
  { id: 'tailWag', rig: 'quad', label: 'Wag tail', seconds: 2, desc: 'happy tail wag with a little body wiggle' },
  { id: 'headTilt', rig: 'quad', label: 'Head tilt (listening)', seconds: 2, desc: 'tilts the head to one side, ears perk' },
  { id: 'earTwitch', rig: 'quad', label: 'Ear twitch', seconds: 1.2, desc: 'quick flick of the ears' },
  { id: 'pawRaise', rig: 'quad', label: 'Raise a front paw', seconds: 2, desc: 'lifts one front paw and holds it up (hand: right|left)' },
  { id: 'playBow', rig: 'quad', label: 'Play bow', seconds: 2.2, desc: 'front end down, tail up, wagging: "let\'s play!"' },
  { id: 'sniff', rig: 'quad', label: 'Sniff', seconds: 1.8, desc: 'head reaches forward and down, little nose bobs (sniffing a friend)' },
  { id: 'excitedHop', rig: 'quad', label: 'Excited hops', seconds: 2, desc: 'small excited jumps on the spot' },
  // any rig with a head
  { id: 'nod', rig: 'any', label: 'Nod (yes)', seconds: 1.6, desc: 'nods the head' },
  { id: 'shake', rig: 'any', label: 'Shake head (no)', seconds: 1.5, desc: 'shakes the head' },
  { id: 'look', rig: 'any', label: 'Look around', seconds: 3, desc: 'looks left and right, curious' },
  { id: 'spin', rig: 'any', label: 'Spin around', seconds: 1.6, desc: 'turns a full circle on the spot' },
  { id: 'bounce', rig: 'any', label: 'Bounce in place', seconds: 2, desc: 'bouncy up-and-down on the spot' },
];
export const RIG_LABEL = { biped: 'two-legged', quadruped: 'four-legged' };
/** Moves a character with this rig type ('biped' | 'quadruped' | null) can perform. */
export const movesFor = (rigType) => (rigType === 'biped' ? MOVE_CATALOG.filter((m) => m.rig !== 'quad')
  : rigType === 'quadruped' ? MOVE_CATALOG.filter((m) => m.rig !== 'biped') : []);
export const moveById = (id) => MOVE_CATALOG.find((m) => m.id === id) || null;
