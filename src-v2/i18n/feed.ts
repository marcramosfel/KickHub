import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'feed.eyebrow': 'Memória da pelada', 'feed.title': 'Atividade',
  'feed.subtitle': 'Sorteios, resultados, substituições e fotografias — incluindo o histórico Browns.',
  'feed.loading': 'A carregar a atividade…', 'feed.errorTitle': 'Não foi possível abrir a atividade.',
  'feed.errorBody': 'Os dados continuam seguros. Tenta novamente.', 'feed.emptyTitle': 'A história começa no próximo jogo.',
  'feed.emptyBody': 'Quando houver um sorteio, resultado ou fotografia, aparece aqui.',
  'feed.kindScheduled': 'Jogo marcado', 'feed.kindDraw': 'Equipas sorteadas', 'feed.kindResult': 'Resultado publicado',
  'feed.kindCancellation': 'Jogo cancelado', 'feed.kindSubstitution': 'Substituição', 'feed.score': 'Equipa A {a} · {b} Equipa B',
} as const satisfies Record<string, TranslationValue>
type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'feed.eyebrow': 'Community memory', 'feed.title': 'Activity', 'feed.subtitle': 'Draws, results, substitutions and photos — including Browns history.',
  'feed.loading': 'Loading activity…', 'feed.errorTitle': 'Could not open activity.', 'feed.errorBody': 'Your data is still safe. Try again.',
  'feed.emptyTitle': 'The story starts with the next match.', 'feed.emptyBody': 'A draw, result or photo will appear here.',
  'feed.kindScheduled': 'Match scheduled', 'feed.kindDraw': 'Teams drawn', 'feed.kindResult': 'Result published',
  'feed.kindCancellation': 'Match cancelled', 'feed.kindSubstitution': 'Substitution', 'feed.score': 'Team A {a} · {b} Team B',
}
const es: Record<Key, TranslationValue> = {
  'feed.eyebrow': 'Memoria de la comunidad', 'feed.title': 'Actividad', 'feed.subtitle': 'Sorteos, resultados, sustituciones y fotos — incluido el historial Browns.',
  'feed.loading': 'Cargando la actividad…', 'feed.errorTitle': 'No se pudo abrir la actividad.', 'feed.errorBody': 'Los datos siguen seguros. Inténtalo de nuevo.',
  'feed.emptyTitle': 'La historia empieza en el próximo partido.', 'feed.emptyBody': 'Los sorteos, resultados y fotos aparecerán aquí.',
  'feed.kindScheduled': 'Partido programado', 'feed.kindDraw': 'Equipos sorteados', 'feed.kindResult': 'Resultado publicado',
  'feed.kindCancellation': 'Partido cancelado', 'feed.kindSubstitution': 'Sustitución', 'feed.score': 'Equipo A {a} · {b} Equipo B',
}
const fr: Record<Key, TranslationValue> = {
  'feed.eyebrow': 'Mémoire de la communauté', 'feed.title': 'Activité', 'feed.subtitle': 'Tirages, résultats, remplacements et photos — historique Browns compris.',
  'feed.loading': 'Chargement de l’activité…', 'feed.errorTitle': 'Impossible d’ouvrir l’activité.', 'feed.errorBody': 'Les données restent en sécurité. Réessaie.',
  'feed.emptyTitle': 'L’histoire commence au prochain match.', 'feed.emptyBody': 'Les tirages, résultats et photos apparaîtront ici.',
  'feed.kindScheduled': 'Match programmé', 'feed.kindDraw': 'Équipes tirées', 'feed.kindResult': 'Résultat publié',
  'feed.kindCancellation': 'Match annulé', 'feed.kindSubstitution': 'Remplacement', 'feed.score': 'Équipe A {a} · {b} Équipe B',
}
const de: Record<Key, TranslationValue> = {
  'feed.eyebrow': 'Community-Chronik', 'feed.title': 'Aktivität', 'feed.subtitle': 'Auslosungen, Ergebnisse, Wechsel und Fotos — einschließlich Browns-Historie.',
  'feed.loading': 'Aktivität wird geladen…', 'feed.errorTitle': 'Aktivität konnte nicht geöffnet werden.', 'feed.errorBody': 'Die Daten bleiben sicher. Versuche es erneut.',
  'feed.emptyTitle': 'Die Geschichte beginnt mit dem nächsten Spiel.', 'feed.emptyBody': 'Auslosungen, Ergebnisse und Fotos erscheinen hier.',
  'feed.kindScheduled': 'Spiel angesetzt', 'feed.kindDraw': 'Teams ausgelost', 'feed.kindResult': 'Ergebnis veröffentlicht',
  'feed.kindCancellation': 'Spiel abgesagt', 'feed.kindSubstitution': 'Wechsel', 'feed.score': 'Team A {a} · {b} Team B',
}

export const feedCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
