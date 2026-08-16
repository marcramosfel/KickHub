import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'awards.title': 'Craque e bagre da rodada',
  'awards.craque': 'Craque',
  'awards.bagre': 'Bagre',
  'awards.voteForCraque': 'O craque da tua equipa',
  'awards.voteForBagre': 'O bagre da tua equipa',
  'awards.noVote': 'Não voto',
  'awards.vote': 'Guardar voto',
  'awards.voting': 'A guardar…',
  'awards.voteError': 'Não foi possível guardar o voto. Tenta novamente.',
  'awards.close': 'Fechar votação',
  'awards.closed': 'Votação fechada',
  'awards.byAdmin': 'decidido pela organização',
  'awards.stillCounting': 'ainda a contar votos',
  'awards.noVotesYet': 'Ainda ninguém votou.',
  'awards.noneDecided': 'Esta rodada ficou sem prémios.',
  'awards.privacy': 'Só tu vês em quem votaste. A pelada vê apenas quem ganhou.',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'awards.title': 'Player and flop of the round',
  'awards.craque': 'Player of the round',
  'awards.bagre': 'Flop of the round',
  'awards.voteForCraque': 'Your team’s best',
  'awards.voteForBagre': 'Your team’s flop',
  'awards.noVote': 'No vote',
  'awards.vote': 'Save vote',
  'awards.voting': 'Saving…',
  'awards.voteError': 'We could not save your vote. Try again.',
  'awards.close': 'Close voting',
  'awards.closed': 'Voting closed',
  'awards.byAdmin': 'decided by the organisers',
  'awards.stillCounting': 'still counting votes',
  'awards.noVotesYet': 'Nobody has voted yet.',
  'awards.noneDecided': 'This round ended without awards.',
  'awards.privacy': 'Only you see your vote. The group only sees who won.',
}

const es: Record<Key, TranslationValue> = {
  'awards.title': 'Crack y peor de la jornada',
  'awards.craque': 'Crack',
  'awards.bagre': 'Peor',
  'awards.voteForCraque': 'El crack de tu equipo',
  'awards.voteForBagre': 'El peor de tu equipo',
  'awards.noVote': 'No voto',
  'awards.vote': 'Guardar voto',
  'awards.voting': 'Guardando…',
  'awards.voteError': 'No pudimos guardar tu voto. Inténtalo de nuevo.',
  'awards.close': 'Cerrar votación',
  'awards.closed': 'Votación cerrada',
  'awards.byAdmin': 'decidido por la organización',
  'awards.stillCounting': 'aún contando votos',
  'awards.noVotesYet': 'Todavía no ha votado nadie.',
  'awards.noneDecided': 'Esta jornada quedó sin premios.',
  'awards.privacy': 'Solo tú ves tu voto. El grupo solo ve quién ganó.',
}

const fr: Record<Key, TranslationValue> = {
  'awards.title': 'Joueur et flop de la journée',
  'awards.craque': 'Joueur de la journée',
  'awards.bagre': 'Flop de la journée',
  'awards.voteForCraque': 'Le meilleur de ton équipe',
  'awards.voteForBagre': 'Le flop de ton équipe',
  'awards.noVote': 'Je ne vote pas',
  'awards.vote': 'Enregistrer le vote',
  'awards.voting': 'Enregistrement…',
  'awards.voteError': 'Impossible d’enregistrer ton vote. Réessaie.',
  'awards.close': 'Clore le vote',
  'awards.closed': 'Vote clos',
  'awards.byAdmin': 'décidé par l’organisation',
  'awards.stillCounting': 'dépouillement en cours',
  'awards.noVotesYet': 'Personne n’a encore voté.',
  'awards.noneDecided': 'Cette journée s’est terminée sans récompense.',
  'awards.privacy': 'Toi seul vois ton vote. Le groupe ne voit que le gagnant.',
}

const de: Record<Key, TranslationValue> = {
  'awards.title': 'Spieler und Flop des Spieltags',
  'awards.craque': 'Spieler des Spieltags',
  'awards.bagre': 'Flop des Spieltags',
  'awards.voteForCraque': 'Der Beste deines Teams',
  'awards.voteForBagre': 'Der Flop deines Teams',
  'awards.noVote': 'Keine Stimme',
  'awards.vote': 'Stimme speichern',
  'awards.voting': 'Wird gespeichert…',
  'awards.voteError': 'Deine Stimme konnte nicht gespeichert werden. Versuch es erneut.',
  'awards.close': 'Abstimmung schließen',
  'awards.closed': 'Abstimmung geschlossen',
  'awards.byAdmin': 'von der Orga entschieden',
  'awards.stillCounting': 'Stimmen werden noch gezählt',
  'awards.noVotesYet': 'Es hat noch niemand abgestimmt.',
  'awards.noneDecided': 'Dieser Spieltag endete ohne Auszeichnungen.',
  'awards.privacy': 'Nur du siehst deine Stimme. Die Gruppe sieht nur, wer gewonnen hat.',
}

export const awardsCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
