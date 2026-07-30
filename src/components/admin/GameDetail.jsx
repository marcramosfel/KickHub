import { useMemo, useRef, useState } from 'react'
import {
  adminAddMedia,
  adminCancelMatch,
  adminDeleteMedia,
  adminDeleteSchedule,
  adminMatchActivity,
  adminPublishResult,
  adminSaveResult,
  adminSetPrimaryMedia,
} from '../../api'
import { formatarDataDoJogo } from '../../lib/countdown'
import { fileToDataURL } from '../../lib/image'
import {
  FASES,
  ETIQUETA_DA_FASE,
  ORDEM_DAS_FASES,
  acoesDoJogo,
  atividadeLegivel,
} from '../../lib/lifecycle'
import { nomeDaEquipa, corDaEquipa } from '../../lib/substitutions'
import Avatar from '../Avatar'
import FootballPitch from '../FootballPitch'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// A página de UM jogo: tudo o que lhe pertence — agenda, equipas, resultado,
// fotos, histórico e ações — num sítio só. É aqui (e só aqui) que se preenche
// e publica o resultado de um jogo agendado.

const TOM_COR = { ok: colors.grass, aviso: colors.teamA, erro: colors.error, neutro: colors.muted }

function FaseChip({ fase }) {
  const e = ETIQUETA_DA_FASE[fase] || { texto: fase, icone: '•', tom: 'neutro' }
  const cor = TOM_COR[e.tom] || colors.muted
  return (
    <span style={chip(cor, `${cor}1A`)}>
      <span aria-hidden>{e.icone}</span> {e.texto}
    </span>
  )
}

// A régua do ciclo de vida: onde este jogo está, do rascunho ao fecho.
function Timeline({ fase }) {
  if (fase === FASES.CANCELADO) return null
  const atual = ORDEM_DAS_FASES.indexOf(fase)
  return (
    <ol
      aria-label="Fases do jogo"
      style={{ display: 'flex', listStyle: 'none', margin: '10px 0 0', padding: 0, gap: 4 }}
    >
      {ORDEM_DAS_FASES.map((f, i) => {
        const feito = i <= atual
        return (
          <li key={f} style={{ flex: 1, minWidth: 0 }} title={ETIQUETA_DA_FASE[f].texto}>
            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: feito ? colors.grass : colors.line,
              }}
            />
          </li>
        )
      })}
    </ol>
  )
}

const stepBtn = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: `1px solid ${colors.line}`,
  background: '#0C1915',
  color: colors.text,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
}

function Stepper({ icon, label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <span aria-hidden style={{ fontSize: 12 }}>{icon}</span>
      <button type="button" aria-label={`Menos um em ${label}`} onClick={() => onChange(Math.max(0, value - 1))} style={stepBtn}>
        −
      </button>
      <span style={{ width: 16, textAlign: 'center', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <button type="button" aria-label={`Mais um em ${label}`} onClick={() => onChange(Math.min(99, value + 1))} style={stepBtn}>
        +
      </button>
    </div>
  )
}

function Seccao({ titulo, children, tom }) {
  return (
    <div className="pb-card" style={tom ? { borderColor: tom } : undefined}>
      <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, marginBottom: 10 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

export default function GameDetail({ pw, jogo, jogadores, onVoltar, onAtualizado, onAbrirAssistente, onAbrirDesistencias, onApagado }) {
  const acoes = useMemo(() => acoesDoJogo(jogo), [jogo])
  const fase = acoes.fase

  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const submetendoRef = useRef(false) // clique duplo não publica duas vezes

  // ---------- formulário do resultado ----------
  const escalacao = useMemo(() => (Array.isArray(jogo?.lineup) ? jogo.lineup : []), [jogo])
  const goleiros = useMemo(() => escalacao.filter((l) => l.is_goalkeeper), [escalacao])

  // Estado inicial: o que já estiver gravado; senão a escalação a zeros.
  // Guardado por id para os steppers não se atropelarem.
  const [form, setForm] = useState(() => {
    const stats = {}
    const base = Array.isArray(jogo?.stats) && jogo.stats.length ? jogo.stats : null
    if (base) {
      for (const s of base) stats[s.player_id] = { team: s.team, goals: s.goals || 0, assists: s.assists || 0 }
    } else {
      for (const l of escalacao) stats[l.player_id] = { team: l.team, goals: 0, assists: 0 }
    }
    const gk = {}
    for (const g of Array.isArray(jogo?.gk_stats) ? jogo.gk_stats : []) {
      gk[g.goalkeeper_id] = { saves: g.saves || 0, conceded: g.goals_conceded || 0 }
    }
    return {
      scoreA: jogo?.score_a ?? 0,
      scoreB: jogo?.score_b ?? 0,
      notes: jogo?.notes || '',
      craqueId: jogo?.craque_override || '',
      bagreId: jogo?.bagre_override || '',
      stats,
      gk,
    }
  })

  const setStat = (id, campo, valor) =>
    setForm((f) => ({ ...f, stats: { ...f.stats, [id]: { ...f.stats[id], [campo]: valor } } }))
  const setGk = (id, campo, valor) =>
    setForm((f) => ({ ...f, gk: { ...f.gk, [id]: { ...(f.gk[id] || { saves: 0, conceded: 0 }), [campo]: valor } } }))

  // ---------- cancelamento (dupla confirmação inline) ----------
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')

  // ---------- histórico ----------
  const [atividade, setAtividade] = useState(null) // null = ainda não carregado

  const d = formatarDataDoJogo(jogo?.kickoff_at)

  const correr = async (fn, mensagem) => {
    if (submetendoRef.current) return
    submetendoRef.current = true
    setBusy(true)
    setErro('')
    try {
      const novo = await fn()
      if (novo?.id) onAtualizado?.(novo)
      if (mensagem) {
        setAviso(mensagem)
        setTimeout(() => setAviso(''), 3000)
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
      submetendoRef.current = false
    }
  }

  const linhasDeStats = () =>
    Object.entries(form.stats).map(([player_id, s]) => ({
      player_id,
      team: s.team || null,
      goals: s.goals || 0,
      assists: s.assists || 0,
    }))

  const linhasDeGk = () =>
    goleiros.map((g) => ({
      goalkeeper_id: g.player_id,
      team: g.team,
      saves: form.gk[g.player_id]?.saves || 0,
      goals_conceded: form.gk[g.player_id]?.conceded || 0,
    }))

  const guardarRascunho = () =>
    correr(
      () =>
        adminSaveResult(pw, jogo.id, {
          scoreA: form.scoreA,
          scoreB: form.scoreB,
          stats: linhasDeStats(),
          gkStats: linhasDeGk(),
          notes: form.notes,
          craqueId: form.craqueId || null,
          bagreId: form.bagreId || null,
        }),
      fase === FASES.RESULTADO_PUBLICADO
        ? 'Resultado atualizado — as estatísticas foram recalculadas.'
        : 'Resultado guardado em rascunho. Só conta depois de publicares.'
    )

  const publicarResultado = async () => {
    if (
      !window.confirm(
        `Publicar o resultado ${form.scoreA}–${form.scoreB}? A partir daqui conta nas estatísticas e aparece a todos.`
      )
    )
      return
    // guarda primeiro o que está no ecrã, depois publica — senão publicava-se
    // um rascunho antigo diferente do que o admin está a ver
    await correr(async () => {
      await adminSaveResult(pw, jogo.id, {
        scoreA: form.scoreA,
        scoreB: form.scoreB,
        stats: linhasDeStats(),
        gkStats: linhasDeGk(),
        notes: form.notes,
        craqueId: form.craqueId || null,
        bagreId: form.bagreId || null,
      })
      return adminPublishResult(pw, jogo.id)
    }, 'Resultado publicado! 🎉')
  }

  const cancelarJogo = () =>
    correr(async () => {
      const novo = await adminCancelMatch(pw, jogo.id, motivoCancelar)
      setConfirmandoCancelar(false)
      return novo
    }, 'Jogo cancelado. Fica no histórico, fora das estatísticas.')

  const apagarJogo = async () => {
    if (!window.confirm('Apagar este jogo? Só é possível em rascunho ou cancelado, e não há volta.'))
      return
    setBusy(true)
    setErro('')
    try {
      await adminDeleteSchedule(pw, jogo.id)
      onApagado?.(jogo.id)
    } catch (e) {
      setErro(e.message)
      setBusy(false)
    }
  }

  const carregarAtividade = () =>
    adminMatchActivity(pw, jogo.id)
      .then((l) => setAtividade(l || []))
      .catch((e) => setErro(e.message))

  const adicionarFoto = async (e, kind) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permitir escolher a mesma foto outra vez
    if (!file) return
    setBusy(true)
    setErro('')
    try {
      const data = await fileToDataURL(file)
      const semFotos = !(jogo.media || []).length
      await adminAddMedia(pw, jogo.id, kind, data, semFotos) // a primeira fica principal
      // as funções de media não devolvem o jogo — pede-se ao pai que recarregue
      onAtualizado?.(null)
      setAviso('Foto adicionada.')
      setTimeout(() => setAviso(''), 2500)
    } catch (e2) {
      setErro(e2.message)
    } finally {
      setBusy(false)
    }
  }

  const nomeDe = (id) => escalacao.find((l) => l.player_id === id)?.name || jogadores?.find((j) => j.id === id)?.name || '—'

  // ---------- render ----------
  return (
    <div className="pb-stack">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px' }}>
          ← Jogos
        </button>
        <FaseChip fase={fase} />
        {aviso && (
          <span role="status" style={{ color: colors.grass, fontSize: 13 }}>
            ✅ {aviso}
          </span>
        )}
      </div>

      {erro && <ErrorBox>{erro}</ErrorBox>}

      {/* ---------- cabeçalho ---------- */}
      <div className="pb-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="pb-break" style={{ fontFamily: fonts.title, fontSize: 20, lineHeight: 1.2 }}>
              {jogo.location || 'Local por definir'}
            </div>
            <div style={{ ...styles.mutedText, fontSize: 13, marginTop: 4 }}>
              {d.hora ? `${d.diaDaSemana}, ${d.data} às ${d.hora}` : 'Data por definir'}
            </div>
          </div>
          {(jogo.team_a_overall || jogo.team_b_overall) && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ color: corDaEquipa('A'), fontFamily: fonts.title, fontSize: 18 }}>
                ⚫ {jogo.team_a_overall ?? '—'}
              </span>
              <span style={{ color: colors.muted, fontSize: 12 }}>vs</span>
              <span style={{ color: corDaEquipa('B'), fontFamily: fonts.title, fontSize: 18 }}>
                ⚪ {jogo.team_b_overall ?? '—'}
              </span>
            </div>
          )}
        </div>
        <Timeline fase={fase} />
        {fase === FASES.CANCELADO && (
          <p style={{ fontSize: 13, color: colors.error, marginTop: 10 }}>
            🚫 Cancelado{jogo.cancel_reason ? ` — ${jogo.cancel_reason}` : ''}. Não conta nas
            estatísticas; fica no histórico.
          </p>
        )}
      </div>

      {/* ---------- equipas ---------- */}
      {escalacao.length > 0 ? (
        <Seccao titulo={`Equipas (${escalacao.length} jogadores)`}>
          <FootballPitch lineup={escalacao} showOverall />
          {acoes.substituir && (
            <button
              type="button"
              onClick={onAbrirDesistencias}
              style={{ ...styles.buttonGhost, marginTop: 12 }}
            >
              🔄 Registar desistência / substituir
            </button>
          )}
        </Seccao>
      ) : (
        <Seccao titulo="Equipas">
          <p style={styles.mutedText}>Ainda não há sorteio para este jogo.</p>
          {acoes.sortear && (
            <button type="button" onClick={onAbrirAssistente} style={{ ...styles.button, marginTop: 12 }}>
              🎲 Sortear no assistente
            </button>
          )}
        </Seccao>
      )}

      {/* ---------- resultado ---------- */}
      {acoes.preencherResultado && (
        <Seccao
          titulo={fase === FASES.RESULTADO_PUBLICADO ? 'Editar resultado (já publicado)' : 'Resultado'}
          tom={fase === FASES.AGUARDA_RESULTADO ? colors.teamA : undefined}
        >
          {fase === FASES.RESULTADO_PUBLICADO && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
              As linhas deste jogo são regravadas ao guardar — as estatísticas recalculam sem
              duplicar nada.
            </p>
          )}

          {/* placar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14 }}>
            {[
              { lado: 'A', campo: 'scoreA' },
              { lado: 'B', campo: 'scoreB' },
            ].map(({ lado, campo }) => (
              <div key={lado} style={{ flex: 1 }}>
                <label style={styles.label} htmlFor={`placar-${lado}`}>
                  {nomeDaEquipa(lado)}
                </label>
                <input
                  id={`placar-${lado}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  style={{ ...styles.input, textAlign: 'center', fontFamily: fonts.title, fontSize: 24 }}
                  value={form[campo]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [campo]: Math.max(0, Math.min(99, Number(e.target.value) || 0)),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: -6, marginBottom: 12 }}>
            {form.scoreA === form.scoreB
              ? '🤝 Empate'
              : `🏆 Vencem os ${form.scoreA > form.scoreB ? nomeDaEquipa('A') : nomeDaEquipa('B')}`}
          </p>

          {/* gols e assistências por jogador */}
          {['A', 'B'].map((lado) => {
            const lista = escalacao.filter((l) => l.team === lado && !l.is_goalkeeper)
            if (!lista.length) return null
            return (
              <div key={lado} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: corDaEquipa(lado), letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  {nomeDaEquipa(lado)}
                </div>
                {lista.map((l) => (
                  <div
                    key={l.player_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${colors.line}` }}
                  >
                    <Avatar name={l.name} photo={l.photo} size={26} />
                    <span className="pb-truncate" style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                      {l.name}
                    </span>
                    <Stepper
                      icon="⚽"
                      label={`gols de ${l.name}`}
                      value={form.stats[l.player_id]?.goals || 0}
                      onChange={(v) => setStat(l.player_id, 'goals', v)}
                    />
                    <Stepper
                      icon="🅰️"
                      label={`assistências de ${l.name}`}
                      value={form.stats[l.player_id]?.assists || 0}
                      onChange={(v) => setStat(l.player_id, 'assists', v)}
                    />
                  </div>
                ))}
              </div>
            )
          })}

          {/* goleiros */}
          {goleiros.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                🧤 Goleiros
              </div>
              {goleiros.map((g) => (
                <div
                  key={g.player_id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${colors.line}` }}
                >
                  <Avatar name={g.name} photo={g.photo} size={26} />
                  <span className="pb-truncate" style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                    {g.name}
                  </span>
                  <Stepper
                    icon="🧤"
                    label={`defesas de ${g.name}`}
                    value={form.gk[g.player_id]?.saves || 0}
                    onChange={(v) => setGk(g.player_id, 'saves', v)}
                  />
                  <Stepper
                    icon="🥅"
                    label={`gols sofridos por ${g.name}`}
                    value={form.gk[g.player_id]?.conceded || 0}
                    onChange={(v) => setGk(g.player_id, 'conceded', v)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* craque e bagre — a votação decide; isto é a correção do admin */}
          <div className="pb-cards" style={{ gap: 10, marginBottom: 12 }}>
            {[
              { campo: 'craqueId', rotulo: '👑 Craque (correção)', id: 'craque-sel' },
              { campo: 'bagreId', rotulo: '🐟 Bagre (correção)', id: 'bagre-sel' },
            ].map(({ campo, rotulo, id }) => (
              <div key={campo}>
                <label style={styles.label} htmlFor={id}>
                  {rotulo}
                </label>
                <select
                  id={id}
                  style={styles.input}
                  value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                >
                  <option value="">— a votação decide —</option>
                  {escalacao.map((l) => (
                    <option key={l.player_id} value={l.player_id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p style={{ ...styles.mutedText, fontSize: 11, marginTop: -6, marginBottom: 12 }}>
            O craque e o bagre continuam a ser decididos pela votação do grupo. Preenche isto só
            para desempatar ou corrigir — e fica registado no histórico do jogo.
          </p>

          <label style={styles.label} htmlFor="obs-jogo">
            Observações (opcional)
          </label>
          <textarea
            id="obs-jogo"
            rows={2}
            style={{ ...styles.input, resize: 'vertical', marginBottom: 12 }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Resenha, casos do jogo…"
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={guardarRascunho}
              disabled={busy}
              style={busy ? disabled({ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }) : { ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
            >
              {busy ? 'A guardar…' : fase === FASES.RESULTADO_PUBLICADO ? '💾 Guardar alterações' : '💾 Guardar rascunho'}
            </button>
            {fase !== FASES.RESULTADO_PUBLICADO && (
              <button
                type="button"
                onClick={publicarResultado}
                disabled={busy}
                style={busy ? disabled({ ...styles.button, flex: '2 1 180px', width: 'auto' }) : { ...styles.button, flex: '2 1 180px', width: 'auto' }}
              >
                {busy ? 'A publicar…' : '📢 Publicar resultado'}
              </button>
            )}
          </div>
        </Seccao>
      )}

      {/* ---------- fotos ---------- */}
      {(acoes.preencherResultado || (jogo.media || []).length > 0) && (
        <Seccao titulo={`Fotos (${(jogo.media || []).length})`}>
          {(jogo.media || []).length > 0 && (
            <div className="pb-cards-sm" style={{ marginBottom: 12 }}>
              {jogo.media.map((m) => (
                <figure key={m.id} style={{ margin: 0, position: 'relative' }}>
                  <img
                    src={m.data_url}
                    alt={m.kind === 'WINNER' ? 'Foto do time vencedor' : 'Foto do jogo'}
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 10,
                      border: `2px solid ${m.is_primary ? colors.grass : colors.line}`,
                      display: 'block',
                    }}
                  />
                  <figcaption style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    {m.is_primary ? (
                      <span style={chip(colors.grass, `${colors.grass}1A`)}>★ principal</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          correr(async () => {
                            await adminSetPrimaryMedia(pw, m.id)
                            onAtualizado?.(null)
                            return null
                          })
                        }
                        style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 12, textDecoration: 'underline' }}
                      >
                        tornar principal
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm('Apagar esta foto?')) return
                        correr(async () => {
                          await adminDeleteMedia(pw, m.id)
                          onAtualizado?.(null)
                          return null
                        })
                      }}
                      style={{ background: 'none', border: 'none', color: colors.error, fontSize: 12, textDecoration: 'underline', marginLeft: 'auto' }}
                    >
                      apagar
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {acoes.preencherResultado && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...styles.buttonGhost, width: 'auto', flex: '1 1 160px', textAlign: 'center', cursor: 'pointer' }}>
                🏆 Foto dos vencedores
                <input type="file" accept="image/*" onChange={(e) => adicionarFoto(e, 'WINNER')} style={{ display: 'none' }} />
              </label>
              <label style={{ ...styles.buttonGhost, width: 'auto', flex: '1 1 160px', textAlign: 'center', cursor: 'pointer' }}>
                📷 Outra foto
                <input type="file" accept="image/*" onChange={(e) => adicionarFoto(e, 'PHOTO')} style={{ display: 'none' }} />
              </label>
            </div>
          )}
        </Seccao>
      )}

      {/* ---------- histórico ---------- */}
      <Seccao titulo="Histórico do jogo">
        {atividade === null ? (
          <button type="button" onClick={carregarAtividade} style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px' }}>
            📜 Ver histórico
          </button>
        ) : atividade.length === 0 ? (
          <p style={styles.mutedText}>Sem registos ainda — a auditoria começou na migração 0019.</p>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {atividade.map((a) => {
              const t = atividadeLegivel(a)
              const dq = formatarDataDoJogo(t.quando)
              return (
                <li key={a.id} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
                  <span aria-hidden style={{ flexShrink: 0 }}>{t.icone}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{t.texto}</span>
                  <span style={{ color: colors.muted, fontSize: 11, flexShrink: 0 }}>
                    {dq.hora ? `${dq.data} ${dq.hora}` : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </Seccao>

      {/* ---------- zona de perigo ---------- */}
      {(acoes.cancelar || acoes.apagar) && (
        <Seccao titulo="Zona de perigo" tom={colors.error}>
          {acoes.cancelar && !confirmandoCancelar && (
            <button
              type="button"
              onClick={() => setConfirmandoCancelar(true)}
              style={{ ...styles.buttonGhost, color: colors.error, borderColor: colors.error }}
            >
              🚫 Cancelar jogo
            </button>
          )}
          {acoes.cancelar && confirmandoCancelar && (
            <div>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Tem a certeza? O jogo <strong>sai das estatísticas</strong> mas fica no histórico
                como cancelado. Os jogadores deixam de o ver como próximo jogo.
              </p>
              <label style={styles.label} htmlFor="motivo-cancel">
                Motivo (opcional, fica visível)
              </label>
              <input
                id="motivo-cancel"
                style={{ ...styles.input, marginBottom: 10 }}
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
                placeholder="Chuva, campo indisponível…"
                maxLength={120}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* o caminho seguro é o primário */}
                <button
                  type="button"
                  onClick={() => setConfirmandoCancelar(false)}
                  style={{ ...styles.button, flex: '2 1 140px', width: 'auto' }}
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={cancelarJogo}
                  disabled={busy}
                  style={{
                    ...styles.buttonGhost,
                    flex: '1 1 180px',
                    width: 'auto',
                    color: '#fff',
                    background: colors.error,
                    borderColor: colors.error,
                    ...(busy ? { opacity: 0.4 } : {}),
                  }}
                >
                  {busy ? 'A cancelar…' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          )}
          {acoes.apagar && (
            <button
              type="button"
              onClick={apagarJogo}
              disabled={busy}
              style={{ ...styles.buttonGhost, color: colors.error, borderColor: colors.error, marginTop: acoes.cancelar ? 10 : 0 }}
            >
              🗑️ Apagar {fase === FASES.CANCELADO ? 'jogo cancelado' : 'rascunho'}
            </button>
          )}
          <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 10 }}>
            Jogos com resultado publicado não se cancelam nem se apagam — são história.
          </p>
        </Seccao>
      )}

      {/* nomes usados nos overrides, para o admin confirmar o que lá está */}
      {(jogo.craque_override || jogo.bagre_override) && (
        <p style={{ ...styles.mutedText, fontSize: 12 }}>
          Correções ativas: {jogo.craque_override ? `craque → ${nomeDe(jogo.craque_override)}` : ''}
          {jogo.craque_override && jogo.bagre_override ? ' · ' : ''}
          {jogo.bagre_override ? `bagre → ${nomeDe(jogo.bagre_override)}` : ''}
        </p>
      )}
    </div>
  )
}
