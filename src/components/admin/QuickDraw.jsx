import { useMemo, useState } from 'react'
import { publishDraw } from '../../api'
import { sorteioRapido, trocarNoRapido } from '../../lib/drawEngine'
import { copiarTexto, partilharTexto } from '../../lib/share'
import { APP_NAME } from '../../config'
import Avatar from '../Avatar'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// Sorteio rápido: o "rachão".
//
// Qualquer número de jogadores, 2 a 4 equipas, sem posições nem agendamento.
// O motor é o mesmo do sorteio oficial (normalização, equilíbrio, semente) —
// só a distribuição muda. Publicar (2 equipas) alimenta o mesmo "último
// sorteio rápido" de sempre; um rachão de 14 com 2 equipas pode subir a
// jogo oficial com um toque.

const CORES = ['#8A96A0', '#F2F5F2', '#FFC531', '#35A7FF']
const NOMES = ['⚫ Pretos', '⚪ Brancos', '🟡 Amarelos', '🔵 Azuis']

// Texto pronto a colar no grupo, para N equipas.
function resumoRapido(resultado) {
  const linhas = [`🎲 ${APP_NAME.main} ${APP_NAME.accent} — Rachão`]
  resultado.equipas.forEach((e, i) => {
    linhas.push('', `${NOMES[i] || `Time ${i + 1}`} (força ${Math.round(e.strength)})`)
    for (const j of e.jogadores) linhas.push(`• ${j.name}`)
  })
  if (resultado.equipas.length >= 2) {
    linhas.push('', `⚖️ Diferença entre a mais forte e a mais fraca: ${Math.round(resultado.diff)}`)
  }
  return linhas.join('\n')
}

export default function QuickDraw({ pw, jogadores, onOficializar }) {
  const [escolhidos, setEscolhidos] = useState(() => new Set())
  const [procura, setProcura] = useState('')
  const [nEquipas, setNEquipas] = useState(2)
  const [modo, setModo] = useState('equilibrado')
  const [resultado, setResultado] = useState(null)
  const [selecao, setSelecao] = useState(null) // troca manual: primeiro toque
  const [tentativa, setTentativa] = useState(0)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const [publicado, setPublicado] = useState(false)

  const visiveis = useMemo(() => {
    const termo = procura.trim().toLowerCase()
    return jogadores.filter((j) => !termo || j.name.toLowerCase().includes(termo))
  }, [jogadores, procura])

  const avisar = (msg) => {
    setAviso(msg)
    setTimeout(() => setAviso(''), 2500)
  }

  const alternar = (id) => {
    setErro('')
    setEscolhidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortear = () => {
    setErro('')
    try {
      const lista = jogadores.filter((j) => escolhidos.has(j.id))
      // a tentativa entra na semente, como no sorteio oficial: "sortear de
      // novo" muda o resultado sem perder a reprodutibilidade
      const seed = `rapido#${[...escolhidos].sort().join(',')}#${nEquipas}#${modo}#${tentativa}`
      setResultado(sorteioRapido({ jogadores: lista, nEquipas, modo, seed }))
      setTentativa((t) => t + 1)
      setSelecao(null)
      setPublicado(false)
    } catch (e) {
      setErro(e.detalhe || e.message)
    }
  }

  const tocarJogador = (id) => {
    if (!resultado) return
    setErro('')
    if (!selecao) return setSelecao(id)
    if (selecao === id) return setSelecao(null)
    try {
      setResultado(trocarNoRapido(resultado, selecao, id))
      setPublicado(false)
      avisar('Troca feita — forças recalculadas.')
    } catch (e) {
      setErro(e.detalhe || e.message)
    } finally {
      setSelecao(null)
    }
  }

  // publicar usa o formato antigo do "sorteio rápido" ({id,name,photo,avg}),
  // que é o que a página de Sorteios já sabe mostrar — só existe para 2 equipas
  const publicar = async () => {
    if (!resultado || resultado.equipas.length !== 2 || busy) return
    if (!window.confirm('Publicar este rachão? Aparece em "Último sorteio rápido" para todos.')) return
    setBusy(true)
    setErro('')
    try {
      const paraLinha = (j) => {
        const completo = jogadores.find((x) => x.id === j.id)
        return { id: j.id, name: j.name, photo: completo?.photo || null, avg: completo?.avg ?? null }
      }
      await publishDraw(
        pw,
        resultado.equipas[0].jogadores.map(paraLinha),
        resultado.equipas[1].jogadores.map(paraLinha)
      )
      setPublicado(true)
      avisar('Rachão publicado!')
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  const partilhar = async () => {
    const r = await partilharTexto(resumoRapido(resultado))
    if (r === 'copiado') avisar('Copiado!')
  }

  const copiar = async () => {
    await copiarTexto(resumoRapido(resultado))
    avisar('Copiado!')
  }

  // subir a jogo oficial: só faz sentido com o plantel exato do 7×7
  const podeOficializar = resultado && resultado.equipas.length === 2 && escolhidos.size === 14

  return (
    <div className="pb-stack">
      {erro && <ErrorBox>{erro}</ErrorBox>}
      {aviso && (
        <p style={{ color: colors.grass, fontSize: 13 }} role="status">
          ✅ {aviso}
        </p>
      )}

      <div className="pb-card">
        <p style={{ fontSize: 14, marginBottom: 10 }}>
          Divide <strong>quem está presente</strong> em equipas, sem posições nem agendamento.
          Serve para o rachão do dia; o jogo oficial da pelada marca-se no{' '}
          <strong>Sorteio completo</strong>.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.muted }}>Equipas</span>
            <select
              value={nEquipas}
              onChange={(e) => setNEquipas(Number(e.target.value))}
              aria-label="Número de equipas"
              style={{ ...styles.input, width: 'auto', padding: '8px 10px' }}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div role="radiogroup" aria-label="Modo do sorteio" style={{ display: 'flex', gap: 6 }}>
            {[
              ['equilibrado', '⚖️ Equilibrado'],
              ['aleatorio', '🎲 Aleatório'],
            ].map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={modo === id}
                onClick={() => setModo(id)}
                className="pb-tab"
                style={{
                  fontSize: 13,
                  background: modo === id ? 'rgba(52,208,88,0.14)' : 'transparent',
                  color: modo === id ? colors.text : colors.muted,
                }}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <label style={styles.label} htmlFor="procura-rapido">
          Quem está? ({escolhidos.size} marcados)
        </label>
        <input
          id="procura-rapido"
          style={{ ...styles.input, marginBottom: 8 }}
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Procurar nome…"
        />
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {visiveis.map((j) => (
            <label
              key={j.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 4px',
                borderBottom: `1px solid ${colors.line}`,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={escolhidos.has(j.id)}
                onChange={() => alternar(j.id)}
                style={{ width: 17, height: 17, accentColor: colors.grass, flexShrink: 0 }}
              />
              <Avatar name={j.name} photo={j.photo} size={28} />
              <span className="pb-truncate" style={{ flex: 1, fontSize: 14 }}>
                {j.name}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  fontFamily: fonts.title,
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}
              >
                {j.overall ?? '—'}
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={sortear}
          disabled={escolhidos.size < nEquipas}
          style={
            escolhidos.size < nEquipas
              ? disabled({ ...styles.button, marginTop: 12 })
              : { ...styles.button, marginTop: 12 }
          }
        >
          🎲 {resultado ? 'Sortear de novo' : 'Sortear'}
        </button>
      </div>

      {resultado && (
        <>
          <div className="pb-card">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                As equipas
              </span>
              <span style={chip(resultado.diff <= 5 ? colors.grass : colors.teamA)}>
                ⚖️ diferença {Math.round(resultado.diff)}
              </span>
              {resultado.semOverall.length > 0 && (
                <span style={{ ...styles.mutedText, fontSize: 12 }}>
                  {resultado.semOverall.length} sem overall (entram com 50)
                </span>
              )}
            </div>
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
              Para trocar dois jogadores, toca num de cada equipa.
            </p>
            <div className="pb-cards" style={{ gap: 10 }}>
              {resultado.equipas.map((e, i) => (
                <div key={i} style={{ ...styles.panel, padding: 12, borderTop: `3px solid ${CORES[i]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span
                      style={{
                        fontFamily: fonts.title,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        fontWeight: 600,
                        color: CORES[i],
                        fontSize: 15,
                      }}
                    >
                      {NOMES[i] || `Time ${i + 1}`}
                    </span>
                    <span style={{ fontSize: 12, color: colors.muted }}>
                      força {Math.round(e.strength)} · média {e.avg.toFixed(1)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {e.jogadores.map((j) => {
                      const marcado = selecao === j.id
                      return (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => tocarJogador(j.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: 6,
                            borderRadius: 10,
                            border: `1px solid ${marcado ? CORES[i] : 'transparent'}`,
                            background: marcado ? '#0C1915' : 'transparent',
                            color: colors.text,
                            font: 'inherit',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <Avatar name={j.name} photo={j.photo} size={26} />
                          <span className="pb-truncate" style={{ flex: 1, fontSize: 14 }}>
                            {j.name}
                          </span>
                          <span style={{ fontSize: 12, color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>
                            {j.overallEstimado ? '~' : ''}
                            {j.overall}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pb-card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={partilhar} className="pb-tab" style={{ fontSize: 13 }}>
                📤 WhatsApp
              </button>
              <button type="button" onClick={copiar} className="pb-tab" style={{ fontSize: 13 }}>
                📋 Copiar
              </button>
              {resultado.equipas.length === 2 && (
                <button
                  type="button"
                  onClick={publicar}
                  disabled={busy || publicado}
                  className="pb-tab"
                  style={{ fontSize: 13, opacity: busy || publicado ? 0.5 : 1 }}
                >
                  {publicado ? '✅ Publicado' : '📢 Publicar rachão'}
                </button>
              )}
              {podeOficializar && (
                <button
                  type="button"
                  onClick={() => onOficializar?.([...escolhidos])}
                  className="pb-tab"
                  style={{ fontSize: 13, color: colors.grass }}
                >
                  ⚽ Transformar em jogo oficial
                </button>
              )}
            </div>
            {resultado.equipas.length === 2 && escolhidos.size !== 14 && (
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
                Com exatamente 14 jogadores podes transformar o rachão num jogo oficial 7×7.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
