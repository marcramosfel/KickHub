import { useEffect, useMemo, useState } from 'react'
import { colors, fonts, styles } from '../theme'
import { estadoDoJogo, formatarDataDoJogo } from '../lib/countdown'

// Aspeto de cada estado especial: ícone + cor (nunca só cor — quem não
// distingue verde de vermelho tem de perceber pelo símbolo e pelo texto).
const CARTOES = {
  cancelado: { icone: '🚫', cor: colors.error, fundo: 'rgba(255, 90, 90, 0.10)', borda: 'rgba(255, 90, 90, 0.35)' },
  concluido: { icone: '🏁', cor: colors.grass, fundo: 'rgba(52, 208, 88, 0.10)', borda: 'rgba(52, 208, 88, 0.32)' },
  'a-decorrer': { icone: '🔴', cor: colors.grass, fundo: 'rgba(52, 208, 88, 0.12)', borda: 'rgba(52, 208, 88, 0.40)' },
  'aguarda-resultado': { icone: '⏳', cor: colors.teamA, fundo: 'rgba(255, 197, 49, 0.10)', borda: 'rgba(255, 197, 49, 0.35)' },
  iminente: { icone: '⏱️', cor: colors.teamA, fundo: 'rgba(255, 197, 49, 0.10)', borda: 'rgba(255, 197, 49, 0.35)' },
  'sem-jogo': { icone: '📅', cor: colors.muted, fundo: 'rgba(127, 160, 144, 0.10)', borda: colors.line },
}

const CARTAO_NEUTRO = CARTOES['sem-jogo']

// Relógio de fachada para os estados que não dependem da hora (cancelado,
// concluído, sem jogo): `estadoDoJogo` decide-os antes de olhar para ele, mas
// o parâmetro é obrigatório e ler a hora real durante o render é proibido.
const SEM_RELOGIO = new Date(0)

const unidade = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`

// Frase para o aria-label. Só com dias/horas/minutos: ler segundos em voz alta
// seria uma tortura e obrigaria a atualizar a etiqueta a cada segundo.
function fraseDaFalta(dias, horas, minutos) {
  const partes = []
  if (dias > 0) partes.push(unidade(dias, 'dia', 'dias'))
  if (horas > 0) partes.push(unidade(horas, 'hora', 'horas'))
  if (minutos > 0) partes.push(unidade(minutos, 'minuto', 'minutos'))
  if (!partes.length) return 'Falta menos de um minuto'
  const ultima = partes.pop()
  return `Faltam ${partes.length ? `${partes.join(', ')} e ${ultima}` : ultima}`
}

// Um dos quatro blocos da contagem. Fora do componente de propósito: definir
// componentes dentro de outros componentes remonta a árvore a cada render.
function Bloco({ valor, etiqueta, tamanho }) {
  return (
    <div
      style={{
        background: '#0C1915',
        border: `1px solid ${colors.line}`,
        borderRadius: 12,
        padding: '10px 2px 8px',
        textAlign: 'center',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: tamanho,
          fontWeight: 600,
          lineHeight: 1,
          color: colors.text,
          fontVariantNumeric: 'tabular-nums', // sem isto os dígitos dançam a cada segundo
        }}
      >
        {valor}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1,
          color: colors.muted,
        }}
      >
        {etiqueta}
      </div>
    </div>
  )
}

/**
 * Contagem regressiva para o próximo jogo.
 *
 * O `setInterval` vive AQUI DENTRO, nunca num componente pai: se o tique
 * estivesse no ecrã principal, cada segundo re-renderizava a página toda
 * (lista de jogadores, escalações, fotos). Assim só este cartão se repinta.
 *
 * O relógio nunca é lido durante o render — só dentro do efeito — para que o
 * render se mantenha puro e o resultado dependa apenas do ISO da base de dados.
 */
export function Countdown({ kickoffAt, status, compacto = false }) {
  // Instante atual em milissegundos. Começa a null: a primeira leitura do
  // relógio acontece já no efeito, depois da montagem.
  const [agora, setAgora] = useState(null)

  const info = useMemo(() => {
    // Cancelado, concluído e "sem jogo" saem só das props — dá para os
    // resolver logo no primeiro render, sem relógio nenhum. Sem isto, um jogo
    // cancelado aparecia primeiro como quatro blocos a "--" e só depois como
    // cartão, um salto visível a cada abertura da página.
    if (status === 'CANCELLED' || status === 'COMPLETED' || !kickoffAt) {
      return estadoDoJogo(kickoffAt, SEM_RELOGIO, status)
    }
    return agora === null ? null : estadoDoJogo(kickoffAt, agora, status)
  }, [agora, kickoffAt, status])
  const data = useMemo(() => formatarDataDoJogo(kickoffAt), [kickoffAt])

  const estado = info ? info.estado : null
  const aContar = estado === 'a-contar'
  // Estados que o relógio já não muda: manter um temporizador seria repintar
  // o mesmo cartão para sempre. "Aguardando resultado" só sai dali quando o
  // admin regista o placar (muda o status, e as props com ele) e um jogo
  // marcado como IN_PROGRESS fica assim até alguém o fechar.
  const estatico =
    estado === 'cancelado' ||
    estado === 'concluido' ||
    estado === 'sem-jogo' ||
    estado === 'aguarda-resultado' ||
    (estado === 'a-decorrer' && status === 'IN_PROGRESS')

  useEffect(() => {
    if (estatico) return undefined
    const ler = () => setAgora(Date.now())
    // Primeira leitura fora do render (daí o timeout) e, a partir daí, ao
    // segundo enquanto conta; nos outros estados basta ao minuto, só para
    // apanhar a passagem a "iminente" / "a decorrer" / "aguarda resultado".
    const inicial = setTimeout(ler, 0)
    const id = setInterval(ler, aContar ? 1000 : 60000)
    return () => {
      clearTimeout(inicial)
      clearInterval(id)
    }
  }, [aContar, estatico])

  const dias = info ? info.dias : 0
  const horas = info ? info.horas : 0
  const minutos = info ? info.minutos : 0
  const texto = info ? info.texto : ''
  const completo = data.completo

  // Etiqueta lida pelos leitores de ecrã. Depende só de dias/horas/minutos,
  // por isso o seu valor muda no máximo uma vez por minuto.
  const etiqueta = useMemo(() => {
    if (!estado) return 'A carregar a contagem para o próximo jogo'
    const quando = completo ? ` Jogo a ${completo}.` : ''
    if (estado === 'a-contar' || estado === 'iminente') {
      return `${fraseDaFalta(dias, horas, minutos)} para o jogo.${quando}`
    }
    return `${texto}.${quando}`
  }, [estado, dias, horas, minutos, texto, completo])

  const cartao = (estado && CARTOES[estado]) || CARTAO_NEUTRO
  const carregar = !estado
  const mostraBlocos = aContar || carregar
  const dd = info ? info.ddStr : '--'
  const hh = info ? info.hhStr : '--'
  const mm = info ? info.mmStr : '--'
  const ss = info ? info.ssStr : '--'

  if (compacto) {
    return (
      <span role="timer" aria-live="off" aria-label={etiqueta}>
        <span
          aria-hidden
          style={{
            ...styles.title,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: 14,
            letterSpacing: 0.5,
            color: mostraBlocos ? colors.text : cartao.cor,
            background: mostraBlocos ? 'rgba(52, 208, 88, 0.10)' : cartao.fundo,
            border: `1px solid ${mostraBlocos ? 'rgba(52, 208, 88, 0.30)' : cartao.borda}`,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{mostraBlocos ? '⏱️' : cartao.icone}</span>
          {mostraBlocos ? `${dd}d ${hh}h ${mm}m ${ss}s` : texto}
        </span>
      </span>
    )
  }

  return (
    <section role="timer" aria-live="off" aria-label={etiqueta} style={{ ...styles.panel }}>
      {completo ? (
        <div
          aria-hidden
          style={{
            ...styles.mutedText,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>📍</span>
          <span>{completo}</span>
        </div>
      ) : null}

      {mostraBlocos ? (
        <div
          aria-hidden
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <Bloco valor={dd} etiqueta="DIAS" tamanho={28} />
          <Bloco valor={hh} etiqueta="HORAS" tamanho={28} />
          <Bloco valor={mm} etiqueta="MIN" tamanho={28} />
          <Bloco valor={ss} etiqueta="SEG" tamanho={28} />
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 12,
            background: cartao.fundo,
            border: `1px solid ${cartao.borda}`,
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{cartao.icone}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: cartao.cor, fontWeight: 700, fontSize: 15 }}>{texto}</div>
            {estado === 'iminente' ? (
              <div style={{ ...styles.mutedText, fontSize: 12.5, marginTop: 2 }}>
                {minutos > 0 ? `Faltam ${minutos} min` : 'Falta menos de um minuto'}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

export default Countdown
