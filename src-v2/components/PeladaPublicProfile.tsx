import { CalendarDays, Clock, MapPin, ShieldCheck, Users } from 'lucide-react'
import { useI18n, type TranslationKey } from '../lib/i18n'
import type { DiscoveredPelada } from '../lib/discovery'
import { Badge } from './ui'

/**
 * O que se vê de uma pelada antes de entrar nela.
 *
 * **Só o que já é público.** Todos os campos aqui vêm do `discover_peladas`, que
 * devolve apenas peladas `public` e apenas as colunas que elas próprias
 * publicaram. O ranking e as estatísticas ficam de fora e não por esquecimento:
 * o `get_pelada_ranking` exige `is_active_member`, e mostrar aqui os golos de
 * cada um era publicar dados de pessoas que não escolheram publicá-los.
 *
 * O mesmo vale para quem administra. Um nome de administrador ao lado de uma
 * pelada pública é informação sobre uma pessoa, e não existe hoje nenhum campo
 * onde ela tenha consentido isso. O canal de contacto é o pedido de entrada,
 * que já leva mensagem — e é por isso que não há aqui um botão de WhatsApp.
 *
 * O que falta mostra-se como falta. Uma pelada que não declarou o dia não
 * ganha um "Sábado" inventado: ganha a ausência da linha.
 */
const WEEKDAYS: TranslationKey[] = [
  'discover.mon', 'discover.tue', 'discover.wed', 'discover.thu',
  'discover.fri', 'discover.sat', 'discover.sun',
]

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export function PeladaPublicProfile({ pelada }: { pelada: DiscoveredPelada }) {
  const { t, formatNumber } = useI18n()

  const place = [pelada.city, pelada.region, pelada.countryCode].filter(Boolean).join(' · ')
  const when = [
    pelada.matchWeekday ? t(WEEKDAYS[pelada.matchWeekday - 1]) : null,
    pelada.matchTime,
  ].filter(Boolean).join(' · ')

  const facts: { icon: JSX.Element; label: string; value: string }[] = []
  if (place) facts.push({ icon: <MapPin size={14}/>, label: t('publicProfile.where'), value: place })
  if (when) facts.push({ icon: <Clock size={14}/>, label: t('publicProfile.when'), value: when })
  if (pelada.frequency) {
    facts.push({
      icon: <CalendarDays size={14}/>, label: t('publicProfile.frequency'),
      value: t(`peladaAdmin.frequency${capitalise(pelada.frequency)}` as TranslationKey),
    })
  }
  facts.push({
    icon: <Users size={14}/>, label: t('publicProfile.squad'),
    // Com tecto declarado diz-se quantos cabem: é a diferença entre "somos 18"
    // e "somos 18 de 20", e a segunda responde à pergunta de quem quer entrar.
    value: pelada.maxPlayers
      ? t('publicProfile.squadOf', {
        count: formatNumber(pelada.members), max: formatNumber(pelada.maxPlayers),
      })
      : t('publicProfile.squadCount', { count: formatNumber(pelada.members) }),
  })

  const full = pelada.maxPlayers !== null && pelada.members >= pelada.maxPlayers

  return (
    <div className="public-profile">
      {pelada.description && <p className="public-profile-about">{pelada.description}</p>}

      <dl className="public-profile-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt><span aria-hidden="true">{fact.icon}</span> {fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="public-profile-tags">
        {pelada.defaultFormat && <Badge tone="neutral">{pelada.defaultFormat}</Badge>}
        {pelada.skillLevel && (
          <Badge tone="neutral">{t(`discover.skill${capitalise(pelada.skillLevel)}` as TranslationKey)}</Badge>
        )}
        {pelada.distanceKm !== null && (
          <Badge tone="blue">{t('discover.distance', { value: formatNumber(pelada.distanceKm) })}</Badge>
        )}
        {full && <Badge tone="orange">{t('publicProfile.full')}</Badge>}
      </div>

      {/* Abrir no mapa do telemóvel em vez de desenhar um mapa aqui.
          Desenhar exigia um fornecedor de mosaicos, uma chave e pedidos a
          partir do browser de quem procura — três decisões de produto para
          responder a uma pergunta que a app de mapas de cada um já responde
          melhor. O ponto enviado é o que a pelada autorizou publicar, com a
          precisão que ela escolheu, e não a morada exacta. */}
      {pelada.point && (
        <a
          className="public-profile-map"
          href={`https://www.google.com/maps/search/?api=1&query=${pelada.point.lat},${pelada.point.lon}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          <MapPin size={14}/> {t('publicProfile.openMap')}
          <small>{t(`peladaAdmin.precision${pelada.point.precision.charAt(0).toUpperCase()}${pelada.point.precision.slice(1)}` as TranslationKey)}</small>
        </a>
      )}

      {/* Como se entra, dito por palavras e não por um modo em inglês. */}
      <p className="public-profile-how">
        <ShieldCheck size={14}/>
        {t(pelada.joinMode === 'open'
          ? 'publicProfile.howOpen'
          : pelada.joinMode === 'approval' ? 'publicProfile.howApproval' : 'publicProfile.howInvite')}
      </p>
    </div>
  )
}
