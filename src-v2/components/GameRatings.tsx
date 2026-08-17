import { Star } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui'
import { useCurrentPelada } from '../lib/current-pelada'
import type { Game } from '../lib/games'
import { useI18n } from '../lib/i18n'
import { useGameLineup } from '../lib/lineups'
import { MAX_STARS, MIN_STARS, useMyGameRatings, useRatingMutations, type GivenRating } from '../lib/ratings'
import { usePeladaSquad } from '../lib/squad'

/**
 * Estrelas pós-jogo: cada um avalia os companheiros da sua equipa naquele jogo.
 *
 * O adversário não aparece de propósito. Ninguém viu jogar quem tinha pelas
 * costas, e deixar avaliar quem se defronta transforma a nota numa arma. O
 * servidor recusa na mesma — isto é o que evita pedir o que vai ser recusado.
 *
 * O que se dá é privado. Quem lê vê apenas o que deu; a pelada vê a média.
 */
export function GameRatings({ game }: { game: Game }) {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const active = game.status === 'played'
  const lineup = useGameLineup(game.id, active)
  const squad = usePeladaSquad(pelada?.id, active)
  const given = useMyGameRatings(game.id, active)
  const save = useRatingMutations(game.id, pelada?.id)

  // Só o que foi mexido nesta sessão. O resto lê-se do servidor em vez de ser
  // copiado para cá: copiar obrigava a um efeito que apagava as escolhas em
  // curso sempre que a consulta revalidasse.
  const [changed, setChanged] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (!active) return null

  const me = (squad.data ?? []).find((member) => member.isMe)
  const entries = lineup.data ?? []
  const mine = me ? entries.find((entry) => entry.membershipId === me.membershipId) : undefined
  // Quem não esteve em campo não avalia — e não vale a pena oferecer-lhe o gesto.
  if (!mine) return null

  const teammates = entries.filter((entry) => entry.team === mine.team && entry.membershipId !== mine.membershipId)
  if (teammates.length === 0) return null

  const saved = new Map((given.data ?? []).map((rating) => [rating.ratedMembershipId, rating.stars]))
  const starsFor = (membershipId: string) => changed[membershipId] ?? saved.get(membershipId) ?? 0

  const submit = async () => {
    setError(''); setNotice('')
    const ratings: GivenRating[] = teammates
      .map((entry) => ({ ratedMembershipId: entry.membershipId, stars: starsFor(entry.membershipId) }))
      .filter((rating) => rating.stars > 0)
    if (ratings.length === 0) {
      setError(t('ratings.nothingChosen'))
      return
    }
    try {
      await save.mutateAsync(ratings)
      setNotice(t('ratings.saved'))
    } catch {
      setError(t('ratings.saveError'))
    }
  }

  return (
    <section className="game-ratings">
      <header className="game-ratings-head">
        <h3>{t('ratings.title')}</h3>
        <small>{t('ratings.privacy')}</small>
      </header>

      <ul className="rating-rows">
        {teammates.map((entry) => (
          <li key={entry.membershipId}>
            <span>{entry.displayName}</span>
            <StarPicker
              name={entry.membershipId}
              value={starsFor(entry.membershipId)}
              label={t('ratings.starsFor', { name: entry.displayName })}
              onChange={(value) => setChanged((current) => ({ ...current, [entry.membershipId]: value }))}
            />
          </li>
        ))}
      </ul>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="inline-notice" role="status">{notice}</p> : null}

      <div className="rating-actions">
        <Button type="button" size="sm" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? t('ratings.saving') : t('ratings.save')}
        </Button>
      </div>
    </section>
  )
}

/**
 * Um grupo de rádios, não botões: escolher uma nota é escolher uma de cinco
 * opções exclusivas, e é assim que um leitor de ecrã o anuncia e que as setas
 * do teclado o percorrem.
 */
function StarPicker({ name, value, label, onChange }: {
  name: string
  value: number
  label: string
  onChange: (value: number) => void
}) {
  const { t, formatNumber } = useI18n()
  const options = Array.from({ length: MAX_STARS }, (_, index) => index + MIN_STARS)

  return (
    <fieldset className="star-picker">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option} className={option <= value ? 'star-on' : 'star-off'}>
          <input
            type="radio"
            name={`stars-${name}`}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          <Star size={20} aria-hidden="true" fill={option <= value ? 'currentColor' : 'none'}/>
          <span className="sr-only">{t('ratings.starsCount', { count: option, value: formatNumber(option) })}</span>
        </label>
      ))}
    </fieldset>
  )
}
