export type Pelada = {
  id: string
  slug: string
  name: string
  city: string
  country: string
  role?: 'owner' | 'admin' | 'player'
  membership: 'active' | 'none'
  joinMode: 'invite' | 'approval' | 'open'
  members: number
  nextMatch: string
  nextMatchAt?: string
  accent: string
  visibility: 'public' | 'unlisted' | 'private'
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
    id: '00000000-0000-4000-8000-000000000101', slug: 'browns', name: 'Pelada Browns', city: 'Zürich', country: 'CH',
    role: 'owner', membership: 'active', joinMode: 'invite', members: 34, nextMatch: 'Sex, 20:30', nextMatchAt: '2026-08-14T20:30:00', accent: '#d8ff45', visibility: 'private',
    description: 'A sexta-feira mais disputada de Zürich. Futebol, resenha e história desde 2019.',
  },
  {
    id: '10000000-0000-4000-8000-000000000101', slug: 'limmat-united', name: 'Limmat United', city: 'Zürich', country: 'CH',
    role: 'player', membership: 'active', joinMode: 'approval', members: 22, nextMatch: 'Dom, 10:00', nextMatchAt: '2026-08-16T10:00:00', accent: '#72d8ff', visibility: 'public',
    description: 'Futebol de domingo às margens do Limmat. Aberta a novos jogadores.',
  },
]

export const discoverPeladas: Pelada[] = [
  peladas[1],
  { id: '20000000-0000-4000-8000-000000000101', slug: 'zurich-international', name: 'Zürich International FC', city: 'Zürich', country: 'CH', membership: 'none', joinMode: 'approval', members: 48, nextMatch: 'Qua, 19:00', accent: '#ff8657', visibility: 'public', description: 'Uma comunidade internacional, jogos em inglês e alemão.' },
  { id: '30000000-0000-4000-8000-000000000101', slug: 'winterthur-5', name: 'Winterthur Fünf', city: 'Winterthur', country: 'CH', membership: 'none', joinMode: 'open', members: 19, nextMatch: 'Sáb, 16:00', accent: '#c8a8ff', visibility: 'public', description: 'Futebol 5 competitivo com vagas rotativas.' },
]

export type DemoJoinRequest = {
  id: string
  peladaId: string
  profileId: string
  playerName: string
  username: string
  message: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export const demoJoinRequests: DemoJoinRequest[] = [
  { id: 'request-joana', peladaId: peladas[0].id, profileId: 'profile-joana', playerName: 'Joana Silva', username: 'joana', message: 'Jogo na ala e procuro uma pelada fixa às sextas.', createdAt: 'Hoje · 09:42', status: 'pending' },
  { id: 'request-malik', peladaId: peladas[0].id, profileId: 'profile-malik', playerName: 'Malik Diallo', username: 'malikd', message: 'Conheço o Bruno e posso jogar no gol ou na linha.', createdAt: 'Ontem · 21:18', status: 'pending' },
  { id: 'request-pedro', peladaId: peladas[0].id, profileId: 'profile-pedro', playerName: 'Pedro Costa', username: 'pedroc', message: 'Novo em Zürich, médio defensivo.', createdAt: '11 ago · 18:05', status: 'pending' },
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
