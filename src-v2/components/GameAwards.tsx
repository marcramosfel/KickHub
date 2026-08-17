import { Lock, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button } from '../components/ui'
import { canVote, useAwardMutations, useGameAwards, useMyGameAwardVotes, type Award, type TeamOutcome } from '../lib/awards'
import { useCurrentPelada } from '../lib/current-pelada'
import type { Game } from '../lib/games'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { useGameLineup } from '../lib/lineups'
import { useGameResult } from '../lib/results'
import { usePeladaSquad } from '../lib/squad'

/**
 * Craque e bagre da rodada: cada equipa vota no seu.
 *
 * Quem ganhou elege o craque entre os seus; quem perdeu elege o bagre entre os
 * seus; num empate no placar não há lados e vota-se nos dois. O adversário
 * nunca aparece — deixar votar em quem se defronta transforma o prémio em
 * ajuste de contas, e o servidor recusa-o na mesma.
 *
 * O voto é privado. O resultado é da pelada inteira: é o que se celebra.
 */
export function GameAwards({ game }: { game: Game }) {
  const { t } = useI18n()
  const { pelada, canAdmin } = useCurrentPelada()
  const active = game.status === 'played'
  const lineup = useGameLineup(game.id, active)
  const squad = usePeladaSquad(pelada?.id, active)
  const result = useGameResult(game.id, active)
  const winners = useGameAwards(game.id, active)
  const myVotes = useMyGameAwardVotes(game.id, active)
  const { vote, close } = useAwardMutations(game.id, pelada?.id)

  const [changed, setChanged] = useState<Partial<Record<Award, string>>>({})
  const [error, setError] = useState('')

  if (!active) return null

  // Fechada quando o que vem do servidor já não é contagem ao vivo.
  const closed = (winners.data ?? []).some((winner) => winner.source !== 'live')

  const me = (squad.data ?? []).find((member) => member.isMe)
  const entries = lineup.data ?? []
  const mine = me ? entries.find((entry) => entry.membershipId === me.membershipId) : undefined
  const teammates = mine
    ? entries.filter((entry) => entry.team === mine.team && entry.membershipId !== mine.membershipId)
    : []

  // O lado sai do placar, tal como no servidor: sem resultado não há lados, e
  // sem lados não se vota.
  const score = result.data
  const outcome: TeamOutcome | null = mine && score
    ? score.scoreA === score.scoreB
      ? 'draw'
      : (mine.team === 'A') === (score.scoreA > score.scoreB) ? 'winner' : 'loser'
    : null

  const saved = new Map((myVotes.data ?? []).map((item) => [item.award, item.nomineeMembershipId]))
  const chosenFor = (award: Award) => changed[award] ?? saved.get(award) ?? ''

  const submit = async () => {
    setError('')
    try {
      await vote.mutateAsync({
        craque: chosenFor('craque') || null,
        bagre: chosenFor('bagre') || null,
      })
    } catch {
      setError(t('awards.voteError'))
    }
  }

  const shown = winners.data ?? []
  if (shown.length === 0 && teammates.length === 0) return null

  return (
    <section className="game-awards">
      <header className="game-awards-head">
        <h3>{t('awards.title')}</h3>
        {closed ? <Badge tone="neutral"><Lock size={11}/> {t('awards.closed')}</Badge> : null}
      </header>

      {shown.length > 0 ? (
        <ul className="award-winners">
          {shown.map((winner) => (
            <li key={`${winner.award}-${winner.membershipId}`} className={`award-${winner.award}`}>
              <Trophy size={15} aria-hidden="true"/>
              <span>{t(`awards.${winner.award}` as TranslationKey)}</span>
              <strong>{winner.displayName}</strong>
              {winner.source === 'admin' ? <small>{t('awards.byAdmin')}</small> : null}
              {winner.source === 'live' ? <small>{t('awards.stillCounting')}</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="award-empty">{closed ? t('awards.noneDecided') : t('awards.noVotesYet')}</p>
      )}

      {!closed && teammates.length > 0 ? (
        <div className="award-ballots">
          {(['craque', 'bagre'] as const).map((award) => (
            canVote(award, outcome) ? (
              <label key={award} className="award-ballot">
                <span>{t(`awards.voteFor${award === 'craque' ? 'Craque' : 'Bagre'}` as TranslationKey)}</span>
                <select
                  value={chosenFor(award)}
                  onChange={(event) => setChanged((current) => ({ ...current, [award]: event.target.value }))}
                >
                  <option value="">{t('awards.noVote')}</option>
                  {teammates.map((entry) => (
                    <option key={entry.membershipId} value={entry.membershipId}>{entry.displayName}</option>
                  ))}
                </select>
              </label>
            ) : null
          ))}

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="award-actions">
            <Button type="button" size="sm" onClick={() => void submit()} disabled={vote.isPending}>
              {vote.isPending ? t('awards.voting') : t('awards.vote')}
            </Button>
            {canAdmin ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void close.mutateAsync()} disabled={close.isPending}>
                {t('awards.close')}
              </Button>
            ) : null}
          </div>
          <small className="award-privacy">{t('awards.privacy')}</small>
        </div>
      ) : null}
    </section>
  )
}
