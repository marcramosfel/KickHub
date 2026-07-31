import { colors, fonts } from '../theme'
import { legendaDaEstrela } from '../lib/labels'

// Estrelas 0–5, só valores inteiros.
//
// O zero é uma nota legítima ("foi só para completar o time"), não a
// ausência de nota — por isso tem célula própria à esquerda em vez de se
// obter tirando estrelas. Sem ela, "ainda não avaliei" e "avaliei com 0"
// eram a mesma coisa no ecrã, e a diferença entre as duas é precisamente o
// que o pedido manda respeitar.

const CELULA = {
  flex: 1,
  minWidth: 0,
  height: 44, // alvo de toque confortável no telemóvel
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: `1px solid ${colors.line}`,
  background: '#0C1915',
  fontSize: 20,
  lineHeight: 1,
  padding: 0,
}

export function StarPicker({ valor, onChange, nome, disabled = false }) {
  const escolhida = Number.isInteger(valor)

  const celula = (n, conteudo, rotulo) => {
    const ativa = escolhida && (n === 0 ? valor === 0 : valor >= n)
    const selecionada = valor === n
    return (
      <button
        key={n}
        type="button"
        disabled={disabled}
        aria-label={rotulo}
        aria-pressed={selecionada}
        onClick={() => onChange(n)}
        style={{
          ...CELULA,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          borderColor: ativa ? colors.teamA : colors.line,
          background: selecionada ? 'rgba(255,199,44,0.12)' : CELULA.background,
          color: ativa ? colors.teamA : colors.muted,
          fontWeight: n === 0 ? 700 : 400,
          fontSize: n === 0 ? 15 : CELULA.fontSize,
        }}
      >
        {conteudo}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={`Estrelas para ${nome}`}
      style={{ display: 'flex', gap: 6, marginTop: 8 }}
    >
      {celula(0, '0', `0 estrelas para ${nome}: ${legendaDaEstrela(0)}`)}
      {[1, 2, 3, 4, 5].map((n) =>
        celula(
          n,
          escolhida && valor >= n ? '★' : '☆',
          `${n} ${n === 1 ? 'estrela' : 'estrelas'} para ${nome}: ${legendaDaEstrela(n)}`,
        ),
      )}
    </div>
  )
}

// A legenda por baixo das estrelas. Altura reservada para a lista não
// saltar quando a frase aparece.
export function StarLegend({ valor }) {
  const texto = Number.isInteger(valor) ? legendaDaEstrela(valor) : 'toca numa estrela'
  return (
    <p
      style={{
        fontSize: 12,
        marginTop: 8,
        minHeight: 16,
        color: Number.isInteger(valor) ? colors.teamA : colors.muted,
      }}
    >
      {texto}
    </p>
  )
}

// Leitura: média recebida, com meia estrela arredondada para o visual.
export function StarScore({ media, votos, tamanho = 14 }) {
  const n = Number(media)
  if (!Number.isFinite(n)) return null
  const cheias = Math.round(n)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* as vazias são ☆ e não ★ apagada: distinguir só pela cor perdia-se
          em quem não distingue cores — e no ecrã pequeno lia-se 5 estrelas */}
      <span aria-hidden style={{ color: colors.teamA, fontSize: tamanho, letterSpacing: 1 }}>
        {'★'.repeat(cheias)}
        <span style={{ color: colors.muted }}>{'☆'.repeat(5 - cheias)}</span>
      </span>
      <span
        style={{
          fontFamily: fonts.title,
          fontSize: tamanho + 1,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n.toFixed(1).replace('.', ',')}
      </span>
      {votos != null && (
        <span style={{ fontSize: 11, color: colors.muted }}>
          ({votos} {votos === 1 ? 'avaliação' : 'avaliações'})
        </span>
      )}
    </span>
  )
}
