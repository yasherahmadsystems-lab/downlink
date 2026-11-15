// Hot-seat roles: who owns which part of the Design Lab, and each role's priority card.
// Pure functions, no DOM. Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// The four roles follow the disciplines that sit in a NASA Mission Design Lab study.
// The priority-card goals are Game balance: they pull against each other on purpose
// (the Science Officer wants the big instrument, the Engineer loses power margin).

const green = (r, ...ids) => ids.every((id) => r.checks.find((c) => c.id === id)?.status === 'green');

export const ROLES = [
  {
    id: 'lead', name: 'Mission Lead',
    owns: 'Saved designs, the comparison and the review request',
    tabs: [],
    card: 'Keep the budget reserve at "Met".',
    met: (r) => green(r, 'budget'),
  },
  {
    id: 'engineer', name: 'Spacecraft Engineer',
    owns: 'Structure, power, computer and attitude control',
    tabs: ['bus', 'solar', 'computer', 'adcs'],
    card: 'Keep the mass, power and energy margins all at "Met".',
    met: (r) => green(r, 'mass', 'power', 'energy'),
  },
  {
    id: 'science', name: 'Science Officer',
    owns: 'The instrument',
    tabs: ['instrument'],
    card: 'Fit the right instrument and return the data the mission requires.',
    met: (r) => green(r, 'instrument') && (r.requirements.find((q) => q.metric === 'downlink_gb_day')?.met ?? true),
  },
  {
    id: 'ops', name: 'Comms and Ops',
    owns: 'Antennas, ground stations and the orbit',
    tabs: ['antenna', 'ground', 'orbit'],
    card: 'Send down at least 90% of the data, with the link margin at "Met".',
    met: (r) => green(r, 'downlink', 'link'),
  },
];

export const ROLE_SOURCE = 'NASA: Mission Design Lab (disciplines); goals are Game balance';

const SEATS = {
  1: [['lead', 'engineer', 'science', 'ops']],
  2: [['lead', 'engineer'], ['science', 'ops']],
  3: [['lead', 'science'], ['engineer'], ['ops']],
  4: [['lead'], ['engineer'], ['science'], ['ops']],
};

export const playerCount = (design) => Math.min(4, Math.max(1, Math.round(Number(design?.players) || 1)));

/** Role ids held by each player, for 1 to 4 players. */
export const seatsFor = (players) => SEATS[Math.min(4, Math.max(1, players))];

/** The roles a player holds, as full role objects. */
export const rolesOf = (players, seat) => (seatsFor(players)[seat] ?? []).map((id) => ROLES.find((r) => r.id === id));

/** Which player (0-based) holds a role. */
export const seatOf = (players, roleId) => seatsFor(players).findIndex((ids) => ids.includes(roleId));

/** The role that owns a catalog tab. */
export const tabOwner = (tabId) => ROLES.find((r) => r.tabs.includes(tabId));

/** Every priority card with whether the evaluated design meets it. */
export const cardsFor = (result) => ROLES.map((role) => ({ id: role.id, name: role.name, card: role.card, met: role.met(result) }));
