import { MapPin } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import type { DiscoveredPelada } from '../lib/discovery'

/**
 * O mapa dos resultados.
 *
 * Não tem mosaicos de rua, e é uma escolha e não um esquecimento: um mapa de
 * verdade obriga a um fornecedor externo, a uma chave e a pedidos que saem do
 * browser de quem procura — decisões de produto que não se tomam de passagem.
 * O que isto faz é o resto do trabalho: projecta os pontos que as peladas
 * autorizaram e deixa a alternância Lista/Mapa a funcionar.
 *
 * Quem não autoriza mostrar o ponto simplesmente não aparece aqui. Não há
 * marcador de "algures nesta cidade" — inventava uma posição.
 *
 * Projecção equirectangular sobre o rectângulo dos resultados. Distorce longe
 * do equador, e para um punhado de peladas na mesma região isso é invisível;
 * dizê-lo é mais honesto do que fingir uma projecção que não se usa.
 */
const PAD = 0.08

export function DiscoveryMap({ peladas, onSelect }: {
  peladas: readonly DiscoveredPelada[]
  onSelect: (pelada: DiscoveredPelada) => void
}) {
  const { t, formatNumber } = useI18n()
  const located = peladas.filter((pelada) => pelada.point !== null)
  const hidden = peladas.length - located.length

  if (!located.length) {
    return (
      <div className="discovery-map discovery-map-empty">
        <MapPin/>
        <p>{t('discover.mapEmpty')}</p>
      </div>
    )
  }

  const lats = located.map((pelada) => pelada.point!.lat)
  const lons = located.map((pelada) => pelada.point!.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  // Um único ponto — ou vários no mesmo sítio — daria um rectângulo de largura
  // zero e uma divisão por zero. O mínimo põe-no no meio.
  const spanLat = Math.max(maxLat - minLat, 0.01)
  const spanLon = Math.max(maxLon - minLon, 0.01)

  const position = (pelada: DiscoveredPelada) => ({
    // O y inverte-se: latitude cresce para norte, e o ecrã cresce para baixo.
    top: `${((1 - (pelada.point!.lat - minLat) / spanLat) * (1 - 2 * PAD) + PAD) * 100}%`,
    left: `${(((pelada.point!.lon - minLon) / spanLon) * (1 - 2 * PAD) + PAD) * 100}%`,
  })

  return (
    <div className="discovery-map">
      <ul className="discovery-map-plot" aria-label={t('discover.mapLabel')}>
        {located.map((pelada) => (
          <li key={pelada.id} style={position(pelada)}>
            <button type="button" onClick={() => onSelect(pelada)}>
              <span className="discovery-pin" aria-hidden="true"><MapPin/></span>
              <span className="discovery-pin-label">
                {pelada.name}
                {pelada.distanceKm !== null && <b>{formatNumber(pelada.distanceKm)} km</b>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="discovery-map-note">
        {t('discover.mapNote')}
        {hidden > 0 && <> {t('discover.mapHidden', { count: hidden })}</>}
      </p>
    </div>
  )
}
