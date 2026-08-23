import { useMemo } from 'react'
import { titleStandings } from '../domain/player-overall'
import { useSignedAvatars } from '../lib/avatars'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { usePeladaPlayers, type PeladaPlayer } from '../lib/pelada-players'
import { PlayerPhoto } from './PlayerPhoto'
import { ShareImageButton } from './ShareImageButton'
import { Badge, Card } from './ui'

/**
 * Os destaques da pelada, em cards e não em linhas de tabela.
 *
 * Uma tabela responde "quem marcou mais golos". Um card responde à mesma coisa
 * e ainda diz de quem se trata — a cara, o número, e uma frase que só faz
 * sentido entre amigos. É essa segunda parte que faz alguém mostrar o ecrã ao
 * lado, e é para isso que a pelada existe.
 *
 * Os líderes vêm de `titleStandings`, o mesmo cálculo que dá os títulos e que
 * alimenta o overall. Contar golos outra vez aqui era criar um sítio onde o
 * artilheiro desta página podia deixar de ser o artilheiro da outra.
 *
 * A participação é a excepção, e é uma soma e não um título: golos mais
 * assistências não entram no overall, e por isso não têm — nem devem ter — uma
 * entrada em `TITLE_METRICS`.
 */
type Hero = {
  id: string
  labelKey: TranslationKey
  icon: string
  player: PeladaPlayer
  value: number
  unitKey: TranslationKey
}

/**
 * Qual das frases sai.
 *
 * Determinística a partir do id de quem lidera: assim não muda a cada desenho —
 * uma frase que pisca a cada re-render lê-se como um defeito — e muda quando o
 * título muda de dono, que é quando faz sentido soar diferente.
 */
function pickLine(heroId: string, membershipId: string, options: number) {
  let hash = 0
  const seed = `${heroId}:${membershipId}`
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % options
}

const LINES_PER_HERO = 3

export function HeroLeaders() {
  const { t, formatNumber } = useI18n()
  const { pelada } = useCurrentPelada()
  const { players, avatarSources } = usePeladaPlayers(pelada?.id)
  // As fotos já assinadas: o cartão desenha-as no canvas, e ir buscá-las de
  // novo era assinar trinta URLs para usar uma.
  const avatars = useSignedAvatars(avatarSources)

  const heroes = useMemo<Hero[]>(() => {
    if (!players.length) return []
    const byId = new Map(players.map((player) => [player.membershipId, player]))
    const standings = titleStandings(players.map((player) => ({
      membershipId: player.membershipId,
      gamesPlayed: player.gamesPlayed,
      goals: player.goals,
      assists: player.assists,
      wins: player.wins,
      draws: player.draws,
      craques: player.craques,
      saves: player.saves,
      bestUnbeatenStreak: player.bestUnbeatenStreak,
      currentWinStreak: player.currentWinStreak,
      gkCleanSheets: player.gkCleanSheets,
    })))

    const fromTitle = (key: string, labelKey: TranslationKey, icon: string, unitKey: TranslationKey): Hero | null => {
      const standing = standings.find((item) => item.key === key)
      // Sem líder não há destaque. Um card a dizer "ainda ninguém" ocupa o mesmo
      // espaço de um que diz alguma coisa, e não diz nada.
      const leader = standing?.holders[0]
      const player = leader ? byId.get(leader) : undefined
      if (!standing || !player || standing.leadingValue === null) return null
      return { id: key, labelKey, icon, player, value: standing.leadingValue, unitKey }
    }

    // Golos mais assistências. Não é um título — não alimenta o overall — mas é
    // a pergunta que o grupo faz a seguir a "quem marcou mais".
    const participation = [...players]
      .map((player) => ({ player, value: player.goals + player.assists }))
      .sort((a, b) => b.value - a.value)[0]

    return [
      fromTitle('topScorer', 'heroes.topScorer', '🔥', 'heroes.unitGoals'),
      fromTitle('topAssists', 'heroes.topAssists', '🎯', 'heroes.unitAssists'),
      participation && participation.value > 0
        ? {
          id: 'participation', labelKey: 'heroes.participation' as TranslationKey, icon: '⚡',
          player: participation.player, value: participation.value,
          unitKey: 'heroes.unitContributions' as TranslationKey,
        }
        : null,
      fromTitle('mostCraques', 'heroes.mostCraques', '👑', 'heroes.unitCraques'),
      fromTitle('mostGames', 'heroes.mostGames', '📅', 'heroes.unitGames'),
      fromTitle('wall', 'heroes.wall', '🧤', 'heroes.unitCleanSheets'),
    ].filter(Boolean) as Hero[]
  }, [players])

  // O carregamento não mostra nada em vez de mostrar uma grelha vazia que a
  // seguir salta para cinco cards: a página por baixo tem a sua própria
  // indicação, e um segundo esqueleto aqui era ruído.
  if (!heroes.length) return null

  return (
    <ul className="hero-leaders">
      {heroes.map((hero) => (
        <li key={hero.id}>
          <Card className="hero-card">
            <Badge tone="lime"><span aria-hidden="true">{hero.icon}</span> {t(hero.labelKey)}</Badge>
            <div className="hero-card-who">
              <PlayerPhoto membershipId={hero.player.membershipId} name={hero.player.displayName}
                size="md" src={avatars.get(hero.player.membershipId)}/>
              <div>
                <strong>
                  {hero.player.displayName}
                  {/* Sem isto, o mesmo ecrã apresentava alguém como artilheiro
                      da pelada sem dizer que ele já não joga lá. */}
                  {hero.player.isFormer && <span className="ranking-former">{t('ranking.former')}</span>}
                </strong>
                <span>{formatNumber(hero.value)} {t(hero.unitKey)}</span>
              </div>
            </div>
            <p className="hero-card-line">
              {t(`${hero.labelKey}Line${pickLine(hero.id, hero.player.membershipId, LINES_PER_HERO) + 1}` as TranslationKey)}
            </p>
            {/* Cada destaque partilha-se sozinho. Um botão só, algures na
                página, obrigava a escolher qual — e a resposta é sempre "o
                daquele jogador", que é o que se está a olhar. */}
            <ShareImageButton
              size="sm"
              filename={`kickhub-${hero.id}.png`}
              text={`${hero.player.displayName} — ${t(hero.labelKey)}`}
              spec={() => ({
                eyebrow: t(hero.labelKey),
                title: hero.player.displayName,
                subtitle: pelada?.name,
                photo: avatars.get(hero.player.membershipId),
                highlight: formatNumber(hero.value),
                stats: [{ label: t(hero.unitKey), value: formatNumber(hero.value) }],
                footer: t(`${hero.labelKey}Line${pickLine(hero.id, hero.player.membershipId, LINES_PER_HERO) + 1}` as TranslationKey),
              })}
            />
          </Card>
        </li>
      ))}
    </ul>
  )
}
