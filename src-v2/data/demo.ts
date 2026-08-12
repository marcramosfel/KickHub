export type Pelada = {
  id: string
  slug: string
  name: string
  city: string
  country: string
  role: 'owner' | 'admin' | 'player'
  members: number
  nextMatch: string
  accent: string
  visibility: 'public' | 'private'
  description: string
}

export const currentProfile = {
  id: 'profile-marcos',
  name: 'Marcos Ramos',
  username: 'marcos',
  city: 'Zürich',
  country: 'CH',
  overall: 4.3,
  matches: 86,
  goals: 41,
  assists: 57,
}

export const peladas: Pelada[] = [
  {
    id: 'browns', slug: 'browns', name: 'Pelada Browns', city: 'Zürich', country: 'CH',
    role: 'owner', members: 34, nextMatch: 'Sex, 20:30', accent: '#d8ff45', visibility: 'private',
    description: 'A sexta-feira mais disputada de Zürich. Futebol, resenha e história desde 2019.',
  },
  {
    id: 'limmat', slug: 'limmat-united', name: 'Limmat United', city: 'Zürich', country: 'CH',
    role: 'player', members: 22, nextMatch: 'Dom, 10:00', accent: '#72d8ff', visibility: 'public',
    description: 'Futebol de domingo às margens do Limmat. Aberta a novos jogadores.',
  },
]

export const discoverPeladas: Pelada[] = [
  peladas[1],
  { id: 'zurich-international', slug: 'zurich-international', name: 'Zürich International FC', city: 'Zürich', country: 'CH', role: 'player', members: 48, nextMatch: 'Qua, 19:00', accent: '#ff8657', visibility: 'public', description: 'Uma comunidade internacional, jogos em inglês e alemão.' },
  { id: 'winterthur', slug: 'winterthur-5', name: 'Winterthur Fünf', city: 'Winterthur', country: 'CH', role: 'player', members: 19, nextMatch: 'Sáb, 16:00', accent: '#c8a8ff', visibility: 'public', description: 'Futebol 5 competitivo com vagas rotativas.' },
]

export const rankings = [
  { rank: 1, name: 'Tiago', value: 4.72, trend: '+2' },
  { rank: 2, name: 'Marcos', value: 4.61, trend: '—' },
  { rank: 3, name: 'Rafa', value: 4.56, trend: '+1' },
  { rank: 4, name: 'Bruno', value: 4.43, trend: '-1' },
  { rank: 5, name: 'Nuno', value: 4.31, trend: '+3' },
]

export const upcomingPlayers = [
  ['Tiago', 'MC'], ['Marcos', 'DEF'], ['Rafa', 'ATA'], ['Bruno', 'GR'], ['Nuno', 'MC'],
  ['Hugo', 'DEF'], ['Dani', 'ATA'], ['Luis', 'MC'], ['Gui', 'DEF'], ['Leo', 'ATA'],
]
