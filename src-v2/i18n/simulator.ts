import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'simulator.title': 'Simulador de equipas',
  'simulator.body': 'Monta as duas equipas à mão e vê o que daria. É o mesmo motor dos outros jogos — só as equipas é que são tuas.',
  'simulator.teamA': 'Equipa A', 'simulator.teamB': 'Equipa B',
  'simulator.clear': 'Limpar', 'simulator.pickMore': 'Escolhe pelo menos dois de cada lado.',
  'simulator.needMore': 'São precisos {count} jogadores com Overall calculado, e há {have}.',
  'simulator.attack': 'Ataque', 'simulator.defence': 'Defesa',
  'simulator.share': 'Partilhar o jogo',
  'simulator.shareText': '{a} {goalsA} · {goalsB} {b} — simulado no KickHub.',
} as const satisfies Record<string, TranslationValue>
type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'simulator.title': 'Team simulator',
  'simulator.body': 'Build both teams by hand and see what would happen. Same engine as the other matches — only the teams are yours.',
  'simulator.teamA': 'Team A', 'simulator.teamB': 'Team B',
  'simulator.clear': 'Clear', 'simulator.pickMore': 'Pick at least two on each side.',
  'simulator.needMore': '{count} players with a settled Overall are needed, and there are {have}.',
  'simulator.attack': 'Attack', 'simulator.defence': 'Defence',
  'simulator.share': 'Share the match',
  'simulator.shareText': '{a} {goalsA} · {goalsB} {b} — simulated on KickHub.',
}
const es: Record<Key, TranslationValue> = {
  'simulator.title': 'Simulador de equipos',
  'simulator.body': 'Monta los dos equipos a mano y mira qué pasaría. El mismo motor de los otros partidos — solo los equipos son tuyos.',
  'simulator.teamA': 'Equipo A', 'simulator.teamB': 'Equipo B',
  'simulator.clear': 'Limpiar', 'simulator.pickMore': 'Elige al menos dos de cada lado.',
  'simulator.needMore': 'Hacen falta {count} jugadores con Overall calculado, y hay {have}.',
  'simulator.attack': 'Ataque', 'simulator.defence': 'Defensa',
  'simulator.share': 'Compartir el partido',
  'simulator.shareText': '{a} {goalsA} · {goalsB} {b} — simulado en KickHub.',
}
const fr: Record<Key, TranslationValue> = {
  'simulator.title': 'Simulateur d’équipes',
  'simulator.body': 'Compose les deux équipes à la main et vois ce que ça donnerait. Le même moteur que les autres matchs — seules les équipes sont de toi.',
  'simulator.teamA': 'Équipe A', 'simulator.teamB': 'Équipe B',
  'simulator.clear': 'Effacer', 'simulator.pickMore': 'Choisis au moins deux joueurs de chaque côté.',
  'simulator.needMore': 'Il faut {count} joueurs avec un Overall établi, et il y en a {have}.',
  'simulator.attack': 'Attaque', 'simulator.defence': 'Défense',
  'simulator.share': 'Partager le match',
  'simulator.shareText': '{a} {goalsA} · {goalsB} {b} — simulé sur KickHub.',
}
const de: Record<Key, TranslationValue> = {
  'simulator.title': 'Team-Simulator',
  'simulator.body': 'Stell beide Teams selbst auf und sieh, was dabei herauskäme. Dieselbe Maschine wie bei den anderen Spielen — nur die Teams sind deine.',
  'simulator.teamA': 'Team A', 'simulator.teamB': 'Team B',
  'simulator.clear': 'Zurücksetzen', 'simulator.pickMore': 'Wähle mindestens zwei pro Seite.',
  'simulator.needMore': 'Es braucht {count} Spieler mit belastbarem Overall, vorhanden sind {have}.',
  'simulator.attack': 'Angriff', 'simulator.defence': 'Abwehr',
  'simulator.share': 'Spiel teilen',
  'simulator.shareText': '{a} {goalsA} · {goalsB} {b} — simuliert auf KickHub.',
}

export const simulatorCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
