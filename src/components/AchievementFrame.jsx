import { memo, useEffect } from 'react'
import { colors, fonts } from '../theme'

// Moldura de título (Rei da Pelada, Paredão, Artilheiro, …).
//
// As cores vêm sempre do `titulo.moldura` e os enfeites do `titulo.estilo`,
// ambos definidos em `lib/achievements.js` — aqui só se decide a FORMA. Assim,
// mudar a paleta ou baptizar um título de outra maneira nunca obriga a tocar
// neste ficheiro.

// Os keyframes vivem num <style> injetado uma única vez (o index.css é
// partilhado por toda a app e não deve crescer por causa das molduras).
// O id fixo garante que N molduras na mesma página não duplicam a folha.
const ESTILO_ID = 'pb-molduras-keyframes'

const CSS = `
@keyframes pbSheen {
  0%        { transform: translateX(-150%); opacity: 0; }
  10%       { opacity: 1; }
  55%       { opacity: 1; }
  70%, 100% { transform: translateX(280%); opacity: 0; }
}
@keyframes pbCoroa {
  0%, 100% { transform: rotate(-14deg) translateY(0); }
  50%      { transform: rotate(-8deg) translateY(-2px); }
}
@keyframes pbAura {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1; }
}
.pb-moldura-sheen { animation: pbSheen 6s ease-in-out infinite; }
.pb-moldura-coroa { animation: pbCoroa 3.4s ease-in-out infinite; transform-origin: 60% 80%; }
.pb-moldura-aura  { animation: pbAura 4.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .pb-moldura-sheen,
  .pb-moldura-coroa,
  .pb-moldura-aura { animation: none !important; }
  .pb-moldura-sheen { opacity: 0 !important; }
}
`

function garantirEstilos() {
  if (typeof document === 'undefined') return
  if (document.getElementById(ESTILO_ID)) return
  const el = document.createElement('style')
  el.id = ESTILO_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

const TAMANHOS = {
  sm: { espessura: 2, raio: 12, fonte: 9, faixaPad: '2px 8px', icone: 11, sombra: 10, enfeite: 15, pad: 4 },
  md: { espessura: 3, raio: 16, fonte: 10, faixaPad: '3px 10px', icone: 13, sombra: 16, enfeite: 19, pad: 6 },
  lg: { espessura: 4, raio: 20, fonte: 12, faixaPad: '5px 13px', icone: 16, sombra: 24, enfeite: 24, pad: 8 },
}

// Fallback neutro: uma moldura mal-formada nunca deve rebentar um ecrã.
const MOLDURA_BASE = {
  borda: colors.line,
  brilho: 'rgba(52, 208, 88, 0.22)',
  fundo: colors.panel,
  cor: colors.grass,
  corTexto: '#06130D',
}

// O brilho metálico é neutro de propósito: sai da cor da borda do próprio
// título, por isso serve o dourado do Rei e o prateado do Paredão sem que este
// ficheiro conheça nenhuma paleta.
const gradienteMetalico = (cor) =>
  `linear-gradient(135deg, ${cor} 0%, rgba(255, 255, 255, 0.85) 48%, ${cor} 100%)`

// Rede de segurança para catálogos antigos (ou de teste) sem `estilo`: se o
// título não declarar os enfeites, ainda os deduzimos pelo nome.
const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    // Escapes \u em vez dos caracteres combinantes em cru: assim o intervalo
    // sobrevive a qualquer ferramenta que reescreva o ficheiro noutra encoding.
    .replace(/[\u0300-\u036f]/g, '') // tira os acentos separados pelo NFD
    .toLowerCase()

function AchievementFrameBase({ titulo, tamanho = 'md', children, style }) {
  // Boolean e não o objeto: o `badgesDoJogador` devolve cópias novas a cada
  // chamada, e o efeito não precisa de correr outra vez por causa disso.
  const temTitulo = Boolean(titulo)
  useEffect(() => {
    if (temTitulo) garantirEstilos()
  }, [temTitulo])

  // Sem título não há envolucro nenhum: zero nós extra no DOM.
  if (!titulo) return <>{children}</>

  const t = TAMANHOS[tamanho] || TAMANHOS.md
  const m = { ...MOLDURA_BASE, ...(titulo.moldura || {}) }
  const est = titulo.estilo || {}
  const marca = `${normalizar(titulo.id)} ${normalizar(titulo.titulo)}`

  const ehRei = est.coroa === true || est.brilhoPulsante === true || marca.includes('pelada')
  const ehBagre =
    est.enferrujada === true || typeof est.inclinacao === 'number' || marca.includes('bagre')
  const ehMetalico = est.metalico === true
  // Graus pequenos de propósito: é uma piada do grupo, não um castigo — e
  // rodar muito faria a moldura transbordar num ecrã de 320px.
  const inclinacao = ehBagre
    ? Math.max(-2, Math.min(2, typeof est.inclinacao === 'number' ? est.inclinacao : -1.2))
    : 0

  return (
    <div
      style={{
        position: 'relative',
        padding: t.espessura,
        borderRadius: t.raio,
        // O Rei e o Paredão ganham a borda com gradiente; os outros ficam lisos.
        background: ehRei || ehMetalico ? gradienteMetalico(m.borda) : m.borda,
        boxShadow: `0 0 ${t.sombra}px ${m.brilho}`,
        transform: inclinacao ? `rotate(${inclinacao}deg)` : undefined,
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {ehRei && (
        <span
          aria-hidden
          className="pb-moldura-aura"
          style={{
            position: 'absolute',
            inset: -1,
            borderRadius: t.raio + 2,
            boxShadow: `0 0 ${t.sombra + 10}px ${m.brilho}`,
            pointerEvents: 'none',
          }}
        />
      )}

      {ehBagre && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: t.raio,
            // "ferrugem": manchas diagonais por cima da borda
            backgroundImage:
              'repeating-linear-gradient(48deg, rgba(0,0,0,0.22) 0 3px, rgba(255,255,255,0.05) 3px 7px)',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        style={{
          position: 'relative',
          borderRadius: Math.max(t.raio - t.espessura, 4),
          background: m.fundo,
          overflow: 'hidden',
        }}
      >
        {/* A moldura nunca depende só da cor: o ícone e o nome do título
            estão sempre visíveis nesta faixa. */}
        <div
          title={titulo.descricao || titulo.titulo}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: t.faixaPad,
            background: m.cor,
            color: m.corTexto,
            fontFamily: fonts.title,
            fontSize: t.fonte,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            minWidth: 0,
          }}
        >
          <span aria-hidden style={{ fontSize: t.icone, lineHeight: 1, flexShrink: 0 }}>
            {titulo.icon}
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {titulo.titulo}
          </span>
        </div>

        <div style={{ padding: t.pad, minWidth: 0 }}>{children}</div>
      </div>

      {ehRei && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: t.raio,
            // `display: block` é obrigatório: num <span> inline o overflow não
            // recorta, e o brilho escapava para fora da moldura (a 320px
            // chegava a empurrar a largura da página).
            display: 'block',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <span
            className="pb-moldura-sheen"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '38%',
              background:
                'linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.16), transparent)',
            }}
          />
        </span>
      )}

      {ehRei && (
        <span
          aria-hidden
          className="pb-moldura-coroa"
          style={{
            position: 'absolute',
            top: -t.enfeite * 0.6,
            left: 6,
            fontSize: t.enfeite,
            lineHeight: 1,
            filter: `drop-shadow(0 2px 4px ${m.brilho})`,
            pointerEvents: 'none',
          }}
        >
          👑
        </span>
      )}

      {ehBagre && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: -t.enfeite * 0.55,
            right: 6,
            fontSize: t.enfeite,
            lineHeight: 1,
            transform: 'rotate(14deg)',
            pointerEvents: 'none',
          }}
        >
          🐟
        </span>
      )}
    </div>
  )
}

export default memo(AchievementFrameBase)
