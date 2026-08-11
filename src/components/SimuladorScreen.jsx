import { useMemo, useState } from 'react'
import { nomeDaPosicao, siglaDaPosicao } from '../lib/positions'
import {
  colocar,
  completo,
  contagem,
  estadoVazio,
  idsEmCampo,
  lineupDe,
  ondeEsta,
  remover,
  slotsDe,
  sugerirEquipas,
} from '../lib/simuladorManual'
import { forcaDaEquipa, contextoDoJogo, golosEsperados, probabilidades, simularPartida } from '../lib/simulador'
import { renderJogoImagem } from '../lib/jogoImagem'
import { useModal } from '../hooks/useModal'
import Avatar from './Avatar'
import FootballPitch from './FootballPitch'
import BotaoPartilhar from './BotaoPartilhar'
import ListaPorEquipa from './ListaPorEquipa'
import { Portal } from './Ui'
import { colors, styles } from '../theme'

// O Simulador: montar qualquer jogo e ver o que dava.
//
// Sem drag-and-drop de propósito. Isto vai ser usado sobretudo no telemóvel, e
// arrastar em touch é frágil — o `MatchWizard` do admin já monta equipas com
// toque-para-escolher e é esse o modelo aqui: toca no lugar, escolhe quem lá
// vai. Mesma funcionalidade, sem a fragilidade.
//
// O estado (quem está onde) vive em `lib/simuladorManual.js` e tem testes.
// A simulação vem do `lib/simulador.js`. Aqui é só desenho.

const NOMES = { A: 'Pretos', B: 'Brancos' }
const CORES = { A: colors.teamA, B: colors.teamB }

function Escolher({ aberto, onFechar, jogadores, ocupados, slot, team, onEscolher }) {
  const [busca, setBusca] = useState('')
  const { ref, aoClicarNoFundo } = useModal(aberto, onFechar)

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return jogadores
      .filter((j) => !t || j.name.toLowerCase().includes(t))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
  }, [jogadores, busca])

  if (!aberto) return null

  return (
    <Portal>
      <div className="pb-overlay" onClick={aoClicarNoFundo}>
        <div ref={ref} className="pb-sheet" role="dialog" aria-modal="true" aria-label="Escolher jogador">
          <div aria-hidden className="pb-sheet-handle" />
          <div style={{ marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>
              {NOMES[team]} · {nomeDaPosicao(slot)}
            </strong>
            <p style={{ ...styles.mutedText, fontSize: 12, margin: '2px 0 0' }}>
              Quem já está escalado aparece marcado — escolhê-lo tira-o de onde estava.
            </p>
          </div>

          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar jogador"
            aria-label="Procurar jogador"
            style={{ ...styles.input, marginBottom: 10 }}
          />

          <div className="pb-stack-sm" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            {lista.map((j) => {
              const onde = ocupados.get(j.id)
              return (
                <button
                  key={j.id}
                  type="button"
                  className="pb-menuitem"
                  onClick={() => onEscolher(j.id)}
                  style={{ gap: 10 }}
                >
                  <Avatar name={j.name} photo={j.photo} size={28} />
                  <span className="pb-truncate" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    {j.name}
                  </span>
                  {onde && (
                    <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0 }}>
                      {NOMES[onde.team]} · {siglaDaPosicao(onde.slot)}
                    </span>
                  )}
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                      color: j.provisorio ? colors.muted : colors.text,
                    }}
                  >
                    {j.overall ?? '—'}
                  </span>
                </button>
              )
            })}
            {!lista.length && <p style={styles.mutedText}>Ninguém com esse nome.</p>}
          </div>

          <button
            type="button"
            className="pb-menuitem"
            style={{ marginTop: 8, justifyContent: 'center', border: `1px solid ${colors.line}` }}
            onClick={onFechar}
          >
            Fechar
          </button>
        </div>
      </div>
    </Portal>
  )
}

function Equipa({ team, estado, porId, onAbrir, onTirar, tamanho }) {
  return (
    <div className="pb-card" style={{ borderColor: CORES[team] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <strong style={{ color: CORES[team], fontSize: 14, letterSpacing: 1 }}>
          {NOMES[team].toUpperCase()}
        </strong>
        <span style={{ ...styles.mutedText, fontSize: 12, marginLeft: 'auto' }}>
          {contagem(estado)[team]}/{slotsDe(tamanho).length}
        </span>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {slotsDe(tamanho).map((slot) => {
          const id = estado[team][slot]
          const j = id ? porId.get(id) : null
          return (
            <li key={slot} className="pb-sim-linha">
              <span className="pb-sim-slot">{siglaDaPosicao(slot)}</span>
              <button
                type="button"
                className="pb-sim-vaga"
                onClick={() => onAbrir(team, slot)}
                aria-label={`${nomeDaPosicao(slot)} de ${NOMES[team]}: ${j ? j.name : 'vazio'}. Tocar para escolher.`}
              >
                {j ? (
                  <>
                    <Avatar name={j.name} photo={j.photo} size={26} />
                    <span className="pb-truncate" style={{ flex: 1, minWidth: 0 }}>
                      {j.name}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{j.overall ?? '—'}</span>
                  </>
                ) : (
                  <span style={{ color: colors.muted, fontSize: 13 }}>+ escolher</span>
                )}
              </button>
              {j && (
                <button
                  type="button"
                  onClick={() => onTirar(j.id)}
                  aria-label={`Tirar ${j.name}`}
                  className="pb-sim-tirar"
                >
                  ×
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Barra({ rotulo, valor, cor }) {
  return (
    <div className="pb-cur-linha">
      <span className="pb-cur-rot pb-truncate">{rotulo}</span>
      <span className="pb-cur-barra">
        <span className="pb-cur-fita" style={{ width: `${valor}%`, background: cor }} aria-hidden />
      </span>
      <span className="pb-cur-pct">{valor}%</span>
    </div>
  )
}

export default function SimuladorScreen({ jogadores, onAbrirJogador }) {
  const tamanho = 7
  const [estado, setEstado] = useState(() => estadoVazio(tamanho))
  const [picker, setPicker] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [tentativa, setTentativa] = useState(0)
  const [aviso, setAviso] = useState('')

  const porId = useMemo(() => new Map((jogadores || []).map((j) => [j.id, j])), [jogadores])
  const ocupados = useMemo(() => {
    const m = new Map()
    for (const id of idsEmCampo(estado)) m.set(id, ondeEsta(estado, id))
    return m
  }, [estado])

  const pronto = completo(estado, tamanho)

  // As probabilidades aparecem ANTES de simular, e mudam à medida que se mexe
  // nas equipas — é o que torna montar o jogo interessante em vez de um
  // formulário.
  const previsao = useMemo(() => {
    if (!pronto) return null
    const a = lineupDe(estado, 'A', jogadores)
    const b = lineupDe(estado, 'B', jogadores)
    const ctx = contextoDoJogo(a, b)
    const fA = forcaDaEquipa(a, ctx)
    const fB = forcaDaEquipa(b, ctx)
    const l = golosEsperados(fA, fB)
    return { prob: probabilidades(l.a, l.b), fA, fB }
  }, [estado, jogadores, pronto])

  const lineupCampo = useMemo(
    () =>
      ['A', 'B'].flatMap((team) =>
        lineupDe(estado, team, jogadores).map((j) => ({
          player_id: j.id,
          name: j.name,
          photo: j.photo,
          team,
          assigned_position: j.slot,
          is_goalkeeper: j.slot === 'GK',
          overall_at_draw: j.slot === 'GK' ? (j.gkOverall ?? j.overall) : j.overall,
        }))
      ),
    [estado, jogadores]
  )

  const sugerir = () => {
    const r = sugerirEquipas({ jogadores, tamanho, seed: `sugestao-${tentativa}` })
    if (!r.ok) {
      setAviso(r.motivo)
      return
    }
    setAviso('')
    setEstado(r.estado)
    setResultado(null)
    setTentativa((n) => n + 1)
  }

  const simular = () => {
    setResultado(
      simularPartida({
        equipaA: lineupDe(estado, 'A', jogadores),
        equipaB: lineupDe(estado, 'B', jogadores),
        seed: `manual-${tentativa}`,
        nomeA: NOMES.A,
        nomeB: NOMES.B,
      })
    )
    setTentativa((n) => n + 1)
  }

  return (
    <div className="pb-stack">
      <p style={{ ...styles.mutedText, fontSize: 13, margin: 0 }}>
        Monta o jogo que quiseres e vê o que dava. Toca num lugar para escolher quem lá joga. Não
        decide nada e não é o sorteio.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={sugerir} className="pb-tap" style={{ ...styles.button, flex: '1 1 160px' }}>
          🎲 Sugerir equipas
        </button>
        <button
          type="button"
          onClick={() => {
            setEstado(estadoVazio(tamanho))
            setResultado(null)
            setAviso('')
          }}
          className="pb-tap"
          style={{ ...styles.buttonGhost, flex: '1 1 120px' }}
        >
          Limpar
        </button>
      </div>

      {aviso && (
        <p style={{ ...styles.mutedText, fontSize: 12, margin: 0 }} role="status">
          {aviso}
        </p>
      )}

      <div className="pb-grid">
        {['A', 'B'].map((team) => (
          <div key={team} className="pb-col-6 pb-col-md-6">
            <Equipa
              team={team}
              estado={estado}
              porId={porId}
              tamanho={tamanho}
              onAbrir={(t, s) => setPicker({ team: t, slot: s })}
              onTirar={(id) => {
                setEstado((e) => remover(e, id))
                setResultado(null)
              }}
            />
          </div>
        ))}
      </div>

      {lineupCampo.length > 0 && (
        <FootballPitch
          lineup={lineupCampo}
          showOverall
          interactive={!!onAbrirJogador}
          onPlayerClick={onAbrirJogador ? (j) => onAbrirJogador(j.id) : undefined}
        />
      )}

      {previsao && (
        <section className="pb-card pb-stack-sm">
          <strong style={{ fontSize: 14 }}>Antes de simular</strong>
          <Barra rotulo={NOMES.A} valor={Math.round(previsao.prob.a * 100)} cor={CORES.A} />
          <Barra rotulo="Empate" valor={Math.round(previsao.prob.empate * 100)} cor={colors.muted} />
          <Barra rotulo={NOMES.B} valor={Math.round(previsao.prob.b * 100)} cor={CORES.B} />
          <table className="pb-cur-tab" style={{ marginTop: 6 }}>
            <tbody>
              {[
                ['Ataque', previsao.fA.ataque, previsao.fB.ataque],
                ['Meio', previsao.fA.meio, previsao.fB.meio],
                ['Defesa', previsao.fA.defesa, previsao.fB.defesa],
                ['Overall médio', previsao.fA.overallMedio, previsao.fB.overallMedio],
              ].map(([r, x, y]) => (
                <tr key={r}>
                  <td className={x >= y ? 'is-melhor' : undefined}>{x.toFixed(1)}</td>
                  <th scope="row">{r}</th>
                  <td className={y >= x ? 'is-melhor' : undefined}>{y.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <button
        type="button"
        onClick={simular}
        disabled={!pronto}
        className="pb-tap"
        style={{ ...styles.button, opacity: pronto ? 1 : 0.5 }}
      >
        {pronto ? '⚽ Simular partida' : `Faltam jogadores (${contagem(estado).A}+${contagem(estado).B} de 14)`}
      </button>

      {resultado && (
        <section className="pb-card pb-stack">
          <div className="pb-cur-placar">
            <span className="pb-truncate">{resultado.nomeA}</span>
            <strong>
              {resultado.golosA} <span aria-hidden>×</span> {resultado.golosB}
            </strong>
            <span className="pb-truncate">{resultado.nomeB}</span>
          </div>

          <p className="pb-cur-narrativa">{resultado.narrativa}</p>

          <div>
            <ListaPorEquipa
              titulo="Gols"
              icone="⚽"
              a={resultado.marcadores.a}
              b={resultado.marcadores.b}
              nomeA={resultado.nomeA}
              nomeB={resultado.nomeB}
            />
            <ListaPorEquipa
              titulo="Assistências"
              icone="🎯"
              a={resultado.assistencias.a}
              b={resultado.assistencias.b}
              nomeA={resultado.nomeA}
              nomeB={resultado.nomeB}
            />
            {resultado.craque && (
              <p style={{ fontSize: 13, margin: '0 0 4px' }}>
                ⭐ <span style={{ color: colors.muted }}>Craque: </span>
                {resultado.craque.name}
              </p>
            )}
            {resultado.bagre && (
              <p style={{ fontSize: 13, margin: '0 0 4px' }}>
                🐟 <span style={{ color: colors.muted }}>Bagre: </span>
                {resultado.bagre.name}
              </p>
            )}
            {resultado.melhorGoleiro && (
              <p style={{ fontSize: 13, margin: '0 0 4px' }}>
                🧤 <span style={{ color: colors.muted }}>Melhor goleiro: </span>
                {resultado.melhorGoleiro.name}
              </p>
            )}
            <p style={{ fontSize: 13, margin: 0 }}>
              📊 <span style={{ color: colors.muted }}>Controlo estimado: </span>
              {resultado.posse.a}% / {resultado.posse.b}%
            </p>
          </div>

          <BotaoPartilhar
            nome="jogo-simulado"
            titulo="Pelada Browns — Jogo simulado"
            gerar={() =>
              renderJogoImagem({
                simulacao: resultado,
                lineupA: lineupDe(estado, 'A', jogadores),
                lineupB: lineupDe(estado, 'B', jogadores),
                titulo: 'Jogo simulado',
              })
            }
          />

          <button type="button" onClick={simular} className="pb-tap" style={{ ...styles.buttonGhost, fontSize: 13 }}>
            🎲 Simular outra vez
          </button>
        </section>
      )}

      <Escolher
        aberto={!!picker}
        onFechar={() => setPicker(null)}
        jogadores={jogadores || []}
        ocupados={ocupados}
        slot={picker?.slot}
        team={picker?.team}
        onEscolher={(id) => {
          setEstado((e) => colocar(e, { id, team: picker.team, slot: picker.slot }))
          setResultado(null)
          setPicker(null)
        }}
      />
    </div>
  )
}
