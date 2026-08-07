import { corDaNota, faixaDaNota, formatarNota } from '../lib/labels'
import { colors, fonts, styles } from '../theme'

// A barra de avaliação: 0 a 5 com uma casa decimal.
//
// Porquê décimas e não estrelas inteiras: com 30 jogadores, seis degraus
// empilham meio plantel no 3 e o sorteio fica sem como os separar. "3,7"
// diz o que "3 ou 4" não consegue dizer.
//
// A barra enche, muda de cor e a reação muda com ela — o emoji e a frase
// são o que torna a nota legível. "3,7" não diz nada a ninguém; "faz o
// simples e não estraga" diz.

const CSS = `
.pb-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; }
.pb-slider:focus { outline: none; }
.pb-slider::-webkit-slider-runnable-track { height: 14px; border-radius: 999px; background: transparent; }
.pb-slider::-moz-range-track { height: 14px; border-radius: 999px; background: transparent; }
.pb-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 30px; height: 30px; border-radius: 50%;
  background: #EAF2EC; border: 3px solid var(--pb-nota, #34D058);
  margin-top: -8px; cursor: grab;
  box-shadow: 0 2px 8px rgba(0,0,0,0.45);
}
.pb-slider::-moz-range-thumb {
  width: 30px; height: 30px; border-radius: 50%;
  background: #EAF2EC; border: 3px solid var(--pb-nota, #34D058);
  cursor: grab; box-shadow: 0 2px 8px rgba(0,0,0,0.45);
}
.pb-slider:active::-webkit-slider-thumb { cursor: grabbing; transform: scale(1.12); }
.pb-reacao { transition: transform 160ms ease; }
@media (prefers-reduced-motion: reduce) {
  .pb-reacao, .pb-barra-fill { transition: none !important; }
}
`

export default function RatingSlider({ valor, onChange, nome, desativado = false }) {
  // `null` = ainda não mexeu. A barra arranca no meio, mas a nota só
  // existe depois de tocar — senão toda a gente levava 2,5 por omissão.
  const tocou = Number.isFinite(Number(valor))
  const v = tocou ? Number(valor) : 2.5
  const faixa = faixaDaNota(v)
  const cor = corDaNota(v)
  const pct = (v / 5) * 100

  return (
    <div style={{ '--pb-nota': cor }}>
      <style>{CSS}</style>

      {/* reação: emoji grande + título + frase */}
      <div
        style={{
          textAlign: 'center',
          minHeight: 104,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
          opacity: tocou ? 1 : 0.45,
        }}
        aria-live="polite"
      >
        <div
          className="pb-reacao"
          style={{ fontSize: 44, lineHeight: 1.1, transform: `scale(${tocou ? 1 : 0.82})` }}
          aria-hidden
        >
          {tocou ? faixa?.emoji : '🤔'}
        </div>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 16,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: tocou ? cor : colors.muted,
          }}
        >
          {tocou ? faixa?.titulo : 'Arrasta para dar a nota'}
        </div>
        <div style={{ ...styles.mutedText, fontSize: 13, minHeight: 18 }}>
          {tocou ? faixa?.frase : ''}
        </div>
      </div>

      {/* o número */}
      <div
        style={{
          textAlign: 'center',
          fontFamily: fonts.title,
          fontSize: 46,
          fontWeight: 700,
          lineHeight: 1,
          color: tocou ? cor : colors.line,
          fontVariantNumeric: 'tabular-nums',
          margin: '6px 0 10px',
        }}
      >
        {tocou ? formatarNota(v) : '—'}
      </div>

      {/* a barra: o preenchimento é um div por baixo do input, para o
          gradiente poder acompanhar a cor da nota em qualquer browser */}
      <div style={{ position: 'relative' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 15,
            height: 14,
            borderRadius: 999,
            background: '#0C1915',
            border: `1px solid ${colors.line}`,
            overflow: 'hidden',
          }}
        >
          <div
            className="pb-barra-fill"
            style={{
              width: tocou ? `${pct}%` : '0%',
              height: '100%',
              background: `linear-gradient(90deg, ${corDaNota(0)}, ${cor})`,
              transition: 'width 90ms linear, background 160ms ease',
            }}
          />
        </div>
        <input
          className="pb-slider"
          type="range"
          min={0}
          max={5}
          step={0.1}
          disabled={desativado}
          value={v}
          onChange={(e) => onChange(Math.round(Number(e.target.value) * 10) / 10)}
          aria-label={`Nota de ${nome}, de 0 a 5`}
          aria-valuetext={tocou ? `${formatarNota(v)} — ${faixa?.titulo}` : 'sem nota'}
          style={{ position: 'relative', zIndex: 1 }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: colors.muted,
          marginTop: -4,
        }}
      >
        <span>0 · bagre</span>
        <span>5 · craque</span>
      </div>
    </div>
  )
}
