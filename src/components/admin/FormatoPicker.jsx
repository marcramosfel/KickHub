import { FORMACOES, GK_MODE, elencoNecessario, formacaoDe } from '../../lib/formacoes'
import { colors, fonts, styles } from '../../theme'

// A escolha do formato do jogo — a decisão que faltava.
//
// Até aqui só existia um formato: 2 goleiros fixos + 12 de campo. Quando no
// dia não havia dois goleiros, o admin tinha de marcar dois jogadores de
// linha como goleiros (com uma caixa que os tornava goleiros PERMANENTES no
// ranking, à distância de um toque) ou fugir pelo rachão, onde o goleiro
// saía à sorte. Nenhuma das duas era uma escolha — eram desenrascanços.
//
// Aqui a decisão é explícita, com ícone, explicação e um campo desenhado ao
// lado. O objetivo é que ninguém tenha de perguntar o que cada opção faz.

// Minicampo ilustrativo. Sete bolinhas: no formato fixo uma é amarela e
// está na baliza; no rotativo são todas iguais e há uma seta a rodar.
function Minicampo({ rotativo }) {
  const pontos = [
    { x: 50, y: 86, gk: true },
    { x: 28, y: 66 },
    { x: 72, y: 66 },
    { x: 16, y: 42 },
    { x: 50, y: 44 },
    { x: 84, y: 42 },
    { x: 50, y: 18 },
  ]
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{
        width: '100%',
        maxWidth: 130,
        display: 'block',
        margin: '0 auto 10px',
        borderRadius: 8,
        background: '#0D2417',
        border: `1px solid ${colors.line}`,
      }}
    >
      <g fill="none" stroke="rgba(234,242,236,0.22)" strokeWidth="0.8">
        <rect x="4" y="4" width="92" height="92" />
        <line x1="4" y1="50" x2="96" y2="50" />
        <circle cx="50" cy="50" r="9" />
        <rect x="30" y="78" width="40" height="18" />
      </g>
      {pontos.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="5.5"
          fill={!rotativo && p.gk ? colors.teamA : '#8A96A0'}
          stroke={rotativo && p.gk ? colors.teamA : 'none'}
          strokeWidth={rotativo && p.gk ? 1.6 : 0}
          strokeDasharray={rotativo && p.gk ? '2 1.6' : undefined}
        />
      ))}
      {rotativo && (
        <text x="50" y="89.5" textAnchor="middle" fontSize="7" fill={colors.teamA}>
          🔄
        </text>
      )}
    </svg>
  )
}

function CartaoFormato({ modo, ativo, tamanho, onEscolher }) {
  const rotativo = modo === GK_MODE.ROTATING
  const elenco = elencoNecessario(tamanho, modo)
  return (
    <button
      type="button"
      onClick={() => onEscolher(modo)}
      aria-pressed={ativo}
      className="pb-card"
      style={{
        textAlign: 'left',
        font: 'inherit',
        color: colors.text,
        cursor: 'pointer',
        borderColor: ativo ? colors.grass : colors.line,
        background: ativo ? 'rgba(52,208,88,0.07)' : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: fonts.title,
          letterSpacing: 1,
          fontSize: 15,
          marginBottom: 8,
        }}
      >
        <span aria-hidden style={{ fontSize: 19 }}>
          {rotativo ? '🔄' : '🧤'}
        </span>
        {rotativo ? 'Sem goleiros fixos' : 'Com goleiros fixos'}
        {ativo && <span style={{ color: colors.grass, marginLeft: 'auto' }}>●</span>}
      </div>

      <Minicampo rotativo={rotativo} />

      <p style={{ fontSize: 13, margin: '0 0 8px', lineHeight: 1.45 }}>
        {rotativo
          ? 'Todos jogam na linha e a posição de goleiro é alternada durante o jogo.'
          : 'Dois jogadores ficam definidos como goleiros durante toda a partida.'}
      </p>
      <p style={{ ...styles.mutedText, fontSize: 12, margin: 0 }}>
        {rotativo
          ? `Precisas de ${elenco.total} jogadores de linha. O sistema escolhe quem começa no gol em cada equipa.`
          : `Precisas de 2 goleiros + ${elenco.campo} jogadores de campo.`}
      </p>
    </button>
  )
}

export default function FormatoPicker({
  gkMode,
  tamanho,
  rotacaoMinutos,
  onMudarModo,
  onMudarTamanho,
  onMudarRotacao,
  bloqueado = false,
}) {
  const f = formacaoDe(tamanho)
  const elenco = elencoNecessario(tamanho, gkMode)

  return (
    <div>
      <div style={{ ...styles.label, marginBottom: 8 }}>Formato do jogo *</div>
      <div
        className="pb-cards"
        style={{ gap: 10, marginBottom: 14, opacity: bloqueado ? 0.5 : 1, pointerEvents: bloqueado ? 'none' : undefined }}
      >
        <CartaoFormato
          modo={GK_MODE.FIXED}
          ativo={gkMode !== GK_MODE.ROTATING}
          tamanho={tamanho}
          onEscolher={onMudarModo}
        />
        <CartaoFormato
          modo={GK_MODE.ROTATING}
          ativo={gkMode === GK_MODE.ROTATING}
          tamanho={tamanho}
          onEscolher={onMudarModo}
        />
      </div>

      <div style={{ ...styles.label, marginBottom: 8 }}>Tamanho da equipa</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {Object.values(FORMACOES).map((op) => {
          const on = Number(tamanho) === op.tamanho
          return (
            <button
              key={op.tamanho}
              type="button"
              disabled={!op.ativa || bloqueado}
              onClick={() => onMudarTamanho(op.tamanho)}
              aria-pressed={on}
              // Os formatos por abrir aparecem desativados em vez de
              // escondidos: esconder fazia parecer que não existiam, mostrar
              // ativos era prometer o que a base ainda não aceita.
              title={op.ativa ? `${op.rotulo} · formação ${op.nome}` : 'ainda não disponível'}
              style={{
                minWidth: 62,
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 10,
                border: `1px solid ${on ? colors.grass : colors.line}`,
                background: on ? 'rgba(52,208,88,0.14)' : '#0C1915',
                color: !op.ativa ? colors.muted : on ? colors.grass : colors.text,
                opacity: op.ativa ? 1 : 0.4,
                cursor: op.ativa ? 'pointer' : 'not-allowed',
                fontFamily: fonts.title,
                fontSize: 15,
                fontWeight: on ? 700 : 500,
              }}
            >
              {op.rotulo}
            </button>
          )
        })}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 14 }}>
        Formação {f.nome} · precisas de <strong>{elenco.total} jogadores</strong>
        {gkMode === GK_MODE.ROTATING ? ' (todos de linha)' : `, sendo 2 goleiros`}.
      </p>

      {gkMode === GK_MODE.ROTATING && (
        <div style={{ marginBottom: 4 }}>
          <label style={styles.label} htmlFor="rotacao">
            Trocar de goleiro a cada (minutos)
          </label>
          <input
            id="rotacao"
            type="number"
            min={1}
            max={120}
            inputMode="numeric"
            placeholder="10"
            disabled={bloqueado}
            value={rotacaoMinutos ?? ''}
            onChange={(e) => onMudarRotacao(e.target.value === '' ? null : Number(e.target.value))}
            style={{ ...styles.input, maxWidth: 160 }}
          />
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 6 }}>
            Opcional. Se preencheres, o sorteio publicado mostra a que minuto cada um vai ao gol.
          </p>
        </div>
      )}
    </div>
  )
}
