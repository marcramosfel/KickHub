import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'ratings.title': 'Avalia os teus companheiros',
  'ratings.privacy': 'Só tu vês o que deste. A pelada vê apenas a média.',
  'ratings.starsFor': 'Estrelas para {name}',
  'ratings.starsCount': { one: '{value} estrela', other: '{value} estrelas' },
  'ratings.save': 'Guardar avaliações',
  'ratings.saving': 'A guardar…',
  'ratings.saved': 'Avaliações guardadas.',
  'ratings.saveError': 'Não foi possível guardar as avaliações. Tenta novamente.',
  'ratings.nothingChosen': 'Escolhe pelo menos uma nota antes de guardar.',
  'ratings.partPostRating': 'Avaliação dos companheiros',
  'ratings.partCraque': 'Craque da rodada',
  'ratings.partBagre': 'Bagre da rodada',
  'ratings.partWae': 'Vitórias acima do esperado',
  'ratings.partTitles': 'Títulos',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'ratings.title': 'Rate your teammates',
  'ratings.privacy': 'Only you see what you gave. The group sees the average.',
  'ratings.starsFor': 'Stars for {name}',
  'ratings.starsCount': { one: '{value} star', other: '{value} stars' },
  'ratings.save': 'Save ratings',
  'ratings.saving': 'Saving…',
  'ratings.saved': 'Ratings saved.',
  'ratings.saveError': 'We could not save the ratings. Try again.',
  'ratings.nothingChosen': 'Pick at least one rating before saving.',
  'ratings.partPostRating': 'Teammate ratings',
  'ratings.partCraque': 'Player of the round',
  'ratings.partBagre': 'Flop of the round',
  'ratings.partWae': 'Wins above expectation',
  'ratings.partTitles': 'Titles',
}

const es: Record<Key, TranslationValue> = {
  'ratings.title': 'Valora a tus compañeros',
  'ratings.privacy': 'Solo tú ves lo que diste. El grupo ve la media.',
  'ratings.starsFor': 'Estrellas para {name}',
  'ratings.starsCount': { one: '{value} estrella', other: '{value} estrellas' },
  'ratings.save': 'Guardar valoraciones',
  'ratings.saving': 'Guardando…',
  'ratings.saved': 'Valoraciones guardadas.',
  'ratings.saveError': 'No pudimos guardar las valoraciones. Inténtalo de nuevo.',
  'ratings.nothingChosen': 'Elige al menos una nota antes de guardar.',
  'ratings.partPostRating': 'Valoración de los compañeros',
  'ratings.partCraque': 'Crack de la jornada',
  'ratings.partBagre': 'Peor de la jornada',
  'ratings.partWae': 'Victorias por encima de lo esperado',
  'ratings.partTitles': 'Títulos',
}

const fr: Record<Key, TranslationValue> = {
  'ratings.title': 'Note tes coéquipiers',
  'ratings.privacy': 'Toi seul vois ce que tu as donné. Le groupe voit la moyenne.',
  'ratings.starsFor': 'Étoiles pour {name}',
  'ratings.starsCount': { one: '{value} étoile', other: '{value} étoiles' },
  'ratings.save': 'Enregistrer les notes',
  'ratings.saving': 'Enregistrement…',
  'ratings.saved': 'Notes enregistrées.',
  'ratings.saveError': 'Impossible d’enregistrer les notes. Réessaie.',
  'ratings.nothingChosen': 'Choisis au moins une note avant d’enregistrer.',
  'ratings.partPostRating': 'Notes des coéquipiers',
  'ratings.partCraque': 'Joueur de la journée',
  'ratings.partBagre': 'Flop de la journée',
  'ratings.partWae': 'Victoires au-dessus des attentes',
  'ratings.partTitles': 'Titres',
}

const de: Record<Key, TranslationValue> = {
  'ratings.title': 'Bewerte deine Mitspieler',
  'ratings.privacy': 'Nur du siehst, was du gegeben hast. Die Gruppe sieht den Schnitt.',
  'ratings.starsFor': 'Sterne für {name}',
  'ratings.starsCount': { one: '{value} Stern', other: '{value} Sterne' },
  'ratings.save': 'Bewertungen speichern',
  'ratings.saving': 'Wird gespeichert…',
  'ratings.saved': 'Bewertungen gespeichert.',
  'ratings.saveError': 'Die Bewertungen konnten nicht gespeichert werden. Versuch es erneut.',
  'ratings.nothingChosen': 'Wähle mindestens eine Note, bevor du speicherst.',
  'ratings.partPostRating': 'Bewertung der Mitspieler',
  'ratings.partCraque': 'Spieler des Spieltags',
  'ratings.partBagre': 'Flop des Spieltags',
  'ratings.partWae': 'Siege über der Erwartung',
  'ratings.partTitles': 'Titel',
}

export const ratingsCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
