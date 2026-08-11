import { compararComResultado } from '../lib/previsao'
import { nomeDaEquipa } from '../lib/substitutions'
import { colors, styles } from '../theme'

// 🤖 A PREVISÃO DA PELADA.
//
// O palpite do simulador para o jogo, congelado quando o sorteio foi
// publicado. Não é recalculado ao abrir o ecrã de propósito: se fosse, dava um
// número diferente de cada vez e ninguém podia dizer "a IA disse 5x4".
//
// Depois do jogo, mostra também o que saiu a sério — que é a parte que dá
// conversa, sobretudo quando falha.

function Barra({ rotulo, valor, cor }) {
  const pct = Math.round((valor ?? 0) * 100)
  return (
    <div className="pb-cur-linha">
      <span className="pb-cur-rot pb-truncate">{rotulo}</span>
      <span className="pb-cur-barra">
        <span className="pb-cur-fita" style={{ width: `${pct}%`, background: cor }} aria-hidden />
      </span>
      <span className="pb-cur-pct">{pct}%</span>
    </div>
  )
}

function Linha({ icone, rotulo, valor }) {
  if (!valor) return null
  return (
    <p style={{ fontSize: 13, margin: '0 0 4px' }}>
      <span aria-hidden style={{ marginRight: 6 }}>
        {icone}
      </span>
      <span style={{ color: colors.muted }}>{rotulo}: </span>
      {valor}
    </p>
  )
}

export default function PrevisaoDaPelada({ jogo, compacto = false }) {
  const f = jogo?.forecast
  if (!f) return null

  // Os mesmos nomes que o resto da app mostra. O `team_a_name` da base diz
  // "Amarelos"/"Azuis" nas rodadas herdadas, e a previsao ficava a contradizer
  // o campo mesmo ao lado.
  // Sem o simbolo: aqui sao rotulos de barras e cabecalhos de placar, e o
  // "⚫" so acrescenta ruido a um sitio onde as cores ja dizem quem e quem.
  const semSimbolo = (n) => String(n || '').replace(/^[^\p{L}]+/u, '').trim()
  const nomeA = semSimbolo(nomeDaEquipa('A'))
  const nomeB = semSimbolo(nomeDaEquipa('B'))
  const comparacao = compararComResultado(f, jogo)

  return (
    <section className="pb-card pb-stack-sm" aria-label="Previsão da pelada">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14, letterSpacing: 0.5 }}>
          <span aria-hidden>🤖</span> A PREVISÃO DA PELADA
        </strong>
        {comparacao && (
          <span
            className="pb-prev-selo"
            style={{
              marginLeft: 'auto',
              borderColor: comparacao.acertou ? colors.grass : colors.error,
              color: comparacao.acertou ? colors.grass : colors.error,
            }}
          >
            {comparacao.acertou ? 'Acertou' : 'Falhou'}
            {comparacao.placarExato && ' — no placar exato!'}
          </span>
        )}
      </div>

      <div className="pb-cur-placar" style={{ padding: '4px 0' }}>
        <span className="pb-truncate">{nomeA}</span>
        <strong style={{ fontSize: 30 }}>
          {f.gols_a} <span aria-hidden>×</span> {f.gols_b}
        </strong>
        <span className="pb-truncate">{nomeB}</span>
      </div>

      {comparacao && (
        <p style={{ ...styles.mutedText, fontSize: 12, textAlign: 'center', margin: 0 }}>
          Deu <strong style={{ color: colors.text }}>{comparacao.real}</strong>.
        </p>
      )}

      <Barra rotulo={nomeA} valor={f.prob_a} cor={colors.teamA} />
      <Barra rotulo="Empate" valor={f.prob_empate} cor={colors.muted} />
      <Barra rotulo={nomeB} valor={f.prob_b} cor={colors.teamB} />

      {!compacto && (
        <div style={{ marginTop: 4 }}>
          <Linha icone="⭐" rotulo="Craque previsto" valor={f.craque} />
          <Linha icone="⚽" rotulo="Artilheiro previsto" valor={f.artilheiro} />
          <Linha icone="🎯" rotulo="Mais assistências" valor={f.assistente} />
          <Linha icone="🐟" rotulo="Bagre previsto" valor={f.bagre} />
        </div>
      )}

      {!compacto && f.narrativa && <p className="pb-cur-narrativa">{f.narrativa}</p>}

      <p style={{ ...styles.mutedText, fontSize: 11, margin: 0 }}>
        Feita quando o sorteio foi publicado, a partir das estatísticas de quem joga. Não decide
        nada — e falha bastante.
      </p>
    </section>
  )
}
