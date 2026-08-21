import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'landing.pageNavigation': 'Navegação da página', 'landing.product': 'Produto', 'landing.community': 'Comunidade', 'landing.security': 'Segurança',
  'landing.heroEyebrow': 'Feito para quem organiza e para quem joga', 'landing.hero': 'A casa digital da sua pelada.',
  'landing.heroBody': 'Organiza jogos, sorteia equipas equilibradas e transforma cada sexta-feira em história.',
  'landing.start': 'Começar agora', 'landing.privacy': 'Privacidade por pelada',
  'landing.seoTitle': 'KickHub — a casa digital da tua pelada',
  'landing.seoDescription': 'Organiza jogos, sorteia equipas equilibradas, acompanha rankings e transforma cada pelada em história. Várias comunidades na mesma conta.',
  'landing.roles': 'Papéis e permissões', 'landing.preview': 'Prévia do painel KickHub', 'landing.nextMatch': 'PRÓXIMO JOGO',
  'landing.fridayTime': 'Sexta · 20:30', 'landing.balance': 'EQUILÍBRIO', 'landing.teamsReady': 'Equipas prontas para jogar',
  'landing.productEyebrow': 'UM JOGO. UMA COMUNIDADE.', 'landing.productTitle': 'Tudo o que acontece antes, durante e depois do apito.',
  'landing.organizeTitle': 'Organiza sem caos', 'landing.organizeBody': 'Convocatória, disponibilidade, local e horário num único lugar.',
  'landing.balanceTitle': 'Equilibra de verdade', 'landing.balanceBody': 'Sorteios consideram Overall, posição e modos de guarda-redes.',
  'landing.historyTitle': 'Constrói a história', 'landing.historyBody': 'Resultados, rankings, conquistas e resenhas que ficam para sempre.',
  'landing.worldEyebrow': 'DE ZÜRICH PARA O MUNDO', 'landing.identityTitle': 'A mesma pessoa. Várias peladas. Uma identidade.',
  'landing.stagingTenant': 'tenant Browns no staging', 'landing.languages': 'idiomas preparados', 'landing.mobileFirst': 'mobile-first',
  'landing.footer': 'O futebol amador merece produto profissional.',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'landing.pageNavigation': 'Page navigation', 'landing.product': 'Product', 'landing.community': 'Community', 'landing.security': 'Security',
  'landing.heroEyebrow': 'Built for organizers and players', 'landing.hero': 'The digital home of your football group.',
  'landing.heroBody': 'Organize matches, draw balanced teams and turn every Friday into a story.',
  'landing.start': 'Get started', 'landing.privacy': 'Privacy per group', 'landing.roles': 'Roles and permissions',
  'landing.seoTitle': 'KickHub — the digital home of your football group',
  'landing.seoDescription': 'Organise matches, draw balanced teams, follow rankings and turn every match into history. Several communities in one account.',
  'landing.preview': 'KickHub dashboard preview', 'landing.nextMatch': 'NEXT MATCH', 'landing.fridayTime': 'Friday · 20:30',
  'landing.balance': 'BALANCE', 'landing.teamsReady': 'Teams ready to play', 'landing.productEyebrow': 'ONE MATCH. ONE COMMUNITY.',
  'landing.productTitle': 'Everything that happens before, during and after the final whistle.',
  'landing.organizeTitle': 'Organize without chaos', 'landing.organizeBody': 'Line-up, availability, venue and time in one place.',
  'landing.balanceTitle': 'Balance teams properly', 'landing.balanceBody': 'Draws consider Overall, position and goalkeeper modes.',
  'landing.historyTitle': 'Build the story', 'landing.historyBody': 'Results, rankings, achievements and recaps that last.',
  'landing.worldEyebrow': 'FROM ZÜRICH TO THE WORLD', 'landing.identityTitle': 'The same person. Multiple groups. One identity.',
  'landing.stagingTenant': 'Browns tenant in staging', 'landing.languages': 'supported languages', 'landing.mobileFirst': 'mobile-first',
  'landing.footer': 'Amateur football deserves a professional product.',
}

const es: Record<Key, TranslationValue> = {
  'landing.pageNavigation': 'Navegación de la página', 'landing.product': 'Producto', 'landing.community': 'Comunidad', 'landing.security': 'Seguridad',
  'landing.heroEyebrow': 'Hecho para quien organiza y quien juega', 'landing.hero': 'La casa digital de tu grupo de fútbol.',
  'landing.heroBody': 'Organiza partidos, sortea equipos equilibrados y convierte cada viernes en una historia.',
  'landing.start': 'Empezar', 'landing.privacy': 'Privacidad por grupo', 'landing.roles': 'Roles y permisos',
  'landing.seoTitle': 'KickHub — la casa digital de tu pelada',
  'landing.seoDescription': 'Organiza partidos, sortea equipos equilibrados, sigue los rankings y convierte cada pelada en historia. Varias comunidades en una cuenta.',
  'landing.preview': 'Vista previa del panel KickHub', 'landing.nextMatch': 'PRÓXIMO PARTIDO', 'landing.fridayTime': 'Viernes · 20:30',
  'landing.balance': 'EQUILIBRIO', 'landing.teamsReady': 'Equipos listos para jugar', 'landing.productEyebrow': 'UN PARTIDO. UNA COMUNIDAD.',
  'landing.productTitle': 'Todo lo que ocurre antes, durante y después del pitido.',
  'landing.organizeTitle': 'Organiza sin caos', 'landing.organizeBody': 'Convocatoria, disponibilidad, lugar y horario en un solo sitio.',
  'landing.balanceTitle': 'Equilibra de verdad', 'landing.balanceBody': 'Los sorteos consideran Overall, posición y modos de portero.',
  'landing.historyTitle': 'Construye la historia', 'landing.historyBody': 'Resultados, rankings, logros y crónicas que permanecen.',
  'landing.worldEyebrow': 'DE ZÚRICH AL MUNDO', 'landing.identityTitle': 'La misma persona. Varios grupos. Una identidad.',
  'landing.stagingTenant': 'tenant Browns en staging', 'landing.languages': 'idiomas disponibles', 'landing.mobileFirst': 'mobile-first',
  'landing.footer': 'El fútbol amateur merece un producto profesional.',
}

const fr: Record<Key, TranslationValue> = {
  'landing.pageNavigation': 'Navigation de la page', 'landing.product': 'Produit', 'landing.community': 'Communauté', 'landing.security': 'Sécurité',
  'landing.heroEyebrow': 'Conçu pour les organisateurs et les joueurs', 'landing.hero': 'La maison numérique de ton groupe de foot.',
  'landing.heroBody': 'Organise les matchs, compose des équipes équilibrées et transforme chaque vendredi en histoire.',
  'landing.start': 'Commencer', 'landing.privacy': 'Confidentialité par groupe', 'landing.roles': 'Rôles et permissions',
  'landing.seoTitle': 'KickHub — la maison numérique de ta pelada',
  'landing.seoDescription': 'Organise les matchs, tire des équipes équilibrées, suis les classements et fais de chaque pelada une histoire. Plusieurs communautés sur un compte.',
  'landing.preview': 'Aperçu du tableau de bord KickHub', 'landing.nextMatch': 'PROCHAIN MATCH', 'landing.fridayTime': 'Vendredi · 20:30',
  'landing.balance': 'ÉQUILIBRE', 'landing.teamsReady': 'Équipes prêtes à jouer', 'landing.productEyebrow': 'UN MATCH. UNE COMMUNAUTÉ.',
  'landing.productTitle': 'Tout ce qui se passe avant, pendant et après le coup de sifflet.',
  'landing.organizeTitle': 'Organise sans chaos', 'landing.organizeBody': 'Convocation, disponibilités, lieu et horaire au même endroit.',
  'landing.balanceTitle': 'Équilibre vraiment', 'landing.balanceBody': 'Les tirages tiennent compte de l’Overall, du poste et des modes gardien.',
  'landing.historyTitle': 'Construis l’histoire', 'landing.historyBody': 'Résultats, classements, succès et résumés qui restent.',
  'landing.worldEyebrow': 'DE ZURICH AU MONDE', 'landing.identityTitle': 'La même personne. Plusieurs groupes. Une identité.',
  'landing.stagingTenant': 'tenant Browns en staging', 'landing.languages': 'langues disponibles', 'landing.mobileFirst': 'mobile-first',
  'landing.footer': 'Le football amateur mérite un produit professionnel.',
}

const de: Record<Key, TranslationValue> = {
  'landing.pageNavigation': 'Seitennavigation', 'landing.product': 'Produkt', 'landing.community': 'Community', 'landing.security': 'Sicherheit',
  'landing.heroEyebrow': 'Für Organisatoren und Spieler gemacht', 'landing.hero': 'Das digitale Zuhause eurer Fußballrunde.',
  'landing.heroBody': 'Organisiert Spiele, lost ausgeglichene Teams aus und macht jeden Freitag zur Geschichte.',
  'landing.start': 'Loslegen', 'landing.privacy': 'Datenschutz pro Gruppe', 'landing.roles': 'Rollen und Berechtigungen',
  'landing.seoTitle': 'KickHub — das digitale Zuhause deiner Pelada',
  'landing.seoDescription': 'Organisiere Spiele, lose ausgeglichene Teams aus, verfolge Ranglisten und mach aus jeder Pelada Geschichte. Mehrere Communitys in einem Konto.',
  'landing.preview': 'Vorschau des KickHub-Dashboards', 'landing.nextMatch': 'NÄCHSTES SPIEL', 'landing.fridayTime': 'Freitag · 20:30',
  'landing.balance': 'AUSGEGLICHENHEIT', 'landing.teamsReady': 'Teams sind spielbereit', 'landing.productEyebrow': 'EIN SPIEL. EINE COMMUNITY.',
  'landing.productTitle': 'Alles, was vor, während und nach dem Abpfiff passiert.',
  'landing.organizeTitle': 'Ohne Chaos organisieren', 'landing.organizeBody': 'Aufgebot, Verfügbarkeit, Ort und Zeit an einem Ort.',
  'landing.balanceTitle': 'Wirklich ausgleichen', 'landing.balanceBody': 'Auslosungen berücksichtigen Overall, Position und Torwartmodi.',
  'landing.historyTitle': 'Schreibt eure Geschichte', 'landing.historyBody': 'Ergebnisse, Ranglisten, Erfolge und Berichte, die bleiben.',
  'landing.worldEyebrow': 'VON ZÜRICH IN DIE WELT', 'landing.identityTitle': 'Dieselbe Person. Mehrere Gruppen. Eine Identität.',
  'landing.stagingTenant': 'Browns-Tenant im Staging', 'landing.languages': 'verfügbare Sprachen', 'landing.mobileFirst': 'mobile-first',
  'landing.footer': 'Amateurfußball verdient ein professionelles Produkt.',
}

export const landingCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
