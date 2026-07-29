import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminMatchesUpcoming, adminSubstitutePlayer, adminUndoSubstitution } from '../../api'
import { OVERALL_NEUTRO } from '../../lib/drawEngine'
import { formatarDataDoJogo } from '../../lib/countdown'
import { nomeDaPosicao, siglaDaPosicao } from '../../lib/positions'
import { corDaEquipa, nomeDaEquipa, resumoDeDesistencias } from '../../lib/substitutions'
import Avatar from '../Avatar'
import FootballPitch from '../FootballPitch'
import { VantagemAtual } from '../Substitutions'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// Desistências de última hora.
//
// A regra da 0016 é que um sorteio publicado não se recalcula, e continua
// de pé: aqui não se re-sorteia nada. Troca-se um jogador por outro no
// mesmo lugar, fica registado quem saiu e quem entrou, e o desequilíbrio
// que daí vier aparece aos jogadores em vez de ser disfarçado.

const LADOS = ['A', 'B']

function Aviso({ tom = 'aviso', children }) {
  const cor = tom === 'erro' ? colors.error : tom === 'ok' ? colors.grass : colors.teamA
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 10,
        background: `${cor}14`,
        border: `1px solid ${cor}55`,
        fontSize: 13,
        marginTop: 10,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0 }}>
        {tom === 'erro' ? '⛔' : tom === 'ok' ? '✅' : '⚠️'}
      </span>
      <span>{children}</span>
    </div>
  )
}

// O overall que vai ficar congelado na escalação. O neutro é o mesmo que o
// motor usa para quem ainda não tem número — sem ele, um substituto sem
// overall punha um `null` na soma e a força da equipa caía sozinha.
const overallDe = (j) => (j?.overall == null ? OVERALL_NEUTRO : Math.round(Number(j.overall)))

export default function SubstitutionsPanel({ pw, jogadores, onDadosAlterados }) {
  const [jogos, setJogos] = useState([])
  const [jogoId, setJogoId] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const [faltaMigracao, setFaltaMigracao] = useState(false)
  const [saiId, setSaiId] = useState(null) // quem desistiu, à espera de substituto
  const [motivo, setMotivo] = useState('')
  const [procura, setProcura] = useState('')

  const porId = useMemo(() => new Map(jogadores.map((j) => [j.id, j])), [jogadores])

  const carregar = useCallback(
    () =>
      adminMatchesUpcoming(pw)
        .then((lista) => {
          // Só jogos publicados: num rascunho não há nada a substituir, o
          // que se faz é voltar a sortear no assistente.
          const abertos = (lista || []).filter(
            (m) => m.status === 'PUBLISHED' || m.status === 'IN_PROGRESS'
          )
          setJogos(abertos)
          setFaltaMigracao(false)
          // A seleção sobrevive a um recarregamento; só se o jogo escolhido
          // tiver desaparecido é que passa para o primeiro da lista.
          setJogoId((atual) => (abertos.some((m) => m.id === atual) ? atual : abertos[0]?.id || ''))
        })
        .catch((e) => {
          setFaltaMigracao(e.code === 'SEMMIGRACAO')
          setErro(e.message)
        }),
    [pw]
  )

  useEffect(() => {
    carregar()
  }, [carregar])

  const jogo = useMemo(() => jogos.find((m) => m.id === jogoId) || null, [jogos, jogoId])
  const escalacao = useMemo(() => (Array.isArray(jogo?.lineup) ? jogo.lineup : []), [jogo])
  const resumo = useMemo(() => resumoDeDesistencias(jogo), [jogo])

  const linhaQueSai = escalacao.find((l) => l.player_id === saiId) || null

  // Quem pode entrar: toda a gente que não esteja já escalada neste jogo.
  const disponiveis = useMemo(() => {
    const escalados = new Set(escalacao.map((l) => l.player_id))
    const termo = procura.trim().toLowerCase()
    return jogadores
      .filter((j) => !escalados.has(j.id))
      .filter((j) => !termo || j.name.toLowerCase().includes(termo))
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1))
  }, [jogadores, escalacao, procura])

  // Uma resposta do servidor traz o jogo inteiro já recalculado: substitui-se
  // a linha na lista em vez de recarregar tudo, para o ecrã não piscar.
  const aplicar = (jogoNovo) => {
    if (!jogoNovo?.id) return
    setJogos((l) => l.map((m) => (m.id === jogoNovo.id ? jogoNovo : m)))
  }

  const cancelar = () => {
    setSaiId(null)
    setMotivo('')
    setProcura('')
  }

  const substituir = async (entra) => {
    if (busy || !jogo || !linhaQueSai) return
    const sai = porId.get(saiId)
    const nomeSai = sai?.name || linhaQueSai.name
    const lugar = linhaQueSai.is_goalkeeper ? 'a baliza' : nomeDaPosicao(linhaQueSai.assigned_position)
    if (
      !window.confirm(
        `Trocar ${nomeSai} por ${entra.name} em ${lugar} (${nomeDaEquipa(linhaQueSai.team)})?\n\n` +
          'As equipas deixam de estar equilibradas e a troca fica visível para todos.'
      )
    )
      return

    setBusy(true)
    setErro('')
    try {
      const jogoNovo = await adminSubstitutePlayer(
        pw,
        jogo.id,
        saiId,
        entra.id,
        overallDe(entra),
        motivo
      )
      aplicar(jogoNovo)
      cancelar()
      setAviso(`${entra.name} entrou no lugar de ${nomeSai}.`)
      setTimeout(() => setAviso(''), 3000)
      await onDadosAlterados?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  const desfazer = async (t) => {
    if (busy) return
    if (!window.confirm(`Desfazer a troca? ${t.saiNome} volta ao lugar de ${t.entraNome}.`)) return
    setBusy(true)
    setErro('')
    try {
      aplicar(await adminUndoSubstitution(pw, t.id))
      setAviso('Troca desfeita.')
      setTimeout(() => setAviso(''), 3000)
      await onDadosAlterados?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- render ----------
  if (faltaMigracao) {
    return (
      <div className="pb-card">
        <p style={{ ...styles.mutedText, fontSize: 13 }}>
          ⚠️ As desistências ainda não estão ativas na base de dados. Aplica a migração{' '}
          <strong>0018_desistencias.sql</strong> no SQL Editor do Supabase (instruções em{' '}
          <code>supabase/APLICAR.md</code>).
        </p>
      </div>
    )
  }

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
          Alguém avisou que não pode ir? Troca-o aqui por outro jogador. O sorteio{' '}
          <strong>não</strong> é refeito: quem entra fica no lugar de quem sai, e o desequilíbrio
          que isso causar aparece na página inicial de todos.
        </p>

        <label style={styles.label} htmlFor="jogo-desistencia">
          Jogo publicado
        </label>
        <select
          id="jogo-desistencia"
          style={styles.input}
          value={jogoId}
          onChange={(e) => {
            setJogoId(e.target.value)
            cancelar()
            setErro('')
          }}
          disabled={jogos.length === 0}
        >
          {jogos.length === 0 && <option value="">Nenhum jogo publicado</option>}
          {jogos.map((m) => {
            const d = formatarDataDoJogo(m.kickoff_at)
            return (
              <option key={m.id} value={m.id}>
                {d.hora ? `${d.data} · ${d.hora}` : 'sem data'} — {m.location || 'sem local'}
              </option>
            )
          })}
        </select>

        {jogos.length === 0 && (
          <Aviso>
            Não há nenhum jogo publicado. As desistências só se tratam depois de o sorteio estar
            publicado — antes disso, muda a lista em “Próximo jogo” e sorteia outra vez.
          </Aviso>
        )}
      </div>

      {jogo && (
        <>
          <div className="pb-card" style={{ padding: 12 }}>
            <FootballPitch lineup={escalacao} showOverall />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 8,
                marginTop: 10,
              }}
            >
              <span style={chip(colors.muted)}>
                ⚫ {jogo.team_a_overall ?? '—'} vs ⚪ {jogo.team_b_overall ?? '—'}
              </span>
              <VantagemAtual vantagem={resumo.vantagem} />
            </div>
          </div>

          {/* ---------- trocas já feitas ---------- */}
          {resumo.houve && (
            <div className="pb-card">
              <div
                style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, marginBottom: 6 }}
              >
                Trocas feitas ({resumo.total})
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {resumo.trocas.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      borderTop: `1px solid ${colors.line}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="pb-truncate" style={{ display: 'block' }}>
                        <span style={{ color: colors.muted, textDecoration: 'line-through' }}>
                          {t.saiNome}
                        </span>{' '}
                        → <strong>{t.entraNome}</strong>
                      </span>
                      <span style={{ fontSize: 11, color: colors.muted }}>
                        {t.equipa} · {t.ehGoleiro ? 'Goleiro' : nomeDaPosicao(t.slot)}
                        {t.delta == null ? '' : ` · ${t.delta > 0 ? '+' : '−'}${Math.abs(t.delta)}`}
                        {t.motivo ? ` · ${t.motivo}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => desfazer(t)}
                      disabled={busy}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.muted,
                        fontSize: 12,
                        textDecoration: 'underline',
                        flexShrink: 0,
                      }}
                    >
                      Desfazer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---------- escolher quem entra ---------- */}
          {linhaQueSai ? (
            <div className="pb-card" style={{ borderColor: colors.teamA }}>
              <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                Quem entra no lugar de {linhaQueSai.name}?
              </div>
              <p style={{ ...styles.mutedText, fontSize: 13, margin: '4px 0 12px' }}>
                {nomeDaEquipa(linhaQueSai.team)} ·{' '}
                {linhaQueSai.is_goalkeeper
                  ? 'Goleiro — quem entrar vai para a baliza'
                  : nomeDaPosicao(linhaQueSai.assigned_position)}
              </p>

              <label style={styles.label} htmlFor="motivo-desistencia">
                Motivo (opcional, fica visível para todos)
              </label>
              <input
                id="motivo-desistencia"
                style={{ ...styles.input, marginBottom: 12 }}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Trabalho, lesão…"
                maxLength={80}
              />

              <label style={styles.label} htmlFor="procura-substituto">
                Procurar jogador
              </label>
              <input
                id="procura-substituto"
                style={{ ...styles.input, marginBottom: 10 }}
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder="Nome…"
              />

              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {disponiveis.length === 0 && (
                  <p style={{ ...styles.mutedText, fontSize: 13, padding: '8px 0' }}>
                    Não há mais ninguém disponível — todos os jogadores já estão escalados.
                  </p>
                )}
                {disponiveis.map((j) => (
                  <div
                    key={j.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 4px',
                      borderBottom: `1px solid ${colors.line}`,
                    }}
                  >
                    <Avatar name={j.name} photo={j.photo} size={30} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="pb-truncate" style={{ display: 'block', fontSize: 14 }}>
                        {j.name}
                      </span>
                      <span style={{ fontSize: 11, color: colors.muted }}>
                        {j.primaryPosition ? nomeDaPosicao(j.primaryPosition) : 'sem posição'}
                        {j.overall == null ? ' · sem overall (entra com 50)' : ''}
                      </span>
                    </span>
                    <span
                      style={{
                        width: 32,
                        textAlign: 'center',
                        fontFamily: fonts.title,
                        fontWeight: 700,
                        color: colors.teamA,
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {j.overall ?? '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => substituir(j)}
                      disabled={busy}
                      style={
                        busy
                          ? disabled({ ...styles.button, width: 'auto', padding: '8px 12px', fontSize: 13 })
                          : { ...styles.button, width: 'auto', padding: '8px 12px', fontSize: 13 }
                      }
                    >
                      Entra
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" onClick={cancelar} style={{ ...styles.buttonGhost, marginTop: 12 }}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="pb-card">
              <div
                style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, marginBottom: 4 }}
              >
                Quem desistiu?
              </div>
              <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 8 }}>
                Toca no jogador que já não pode ir.
              </p>
              <div className="pb-cards" style={{ gap: 12 }}>
                {LADOS.map((lado) => {
                  const lista = escalacao.filter((l) => l.team === lado)
                  if (!lista.length) return null
                  return (
                    <div key={lado}>
                      <div
                        style={{
                          fontSize: 12,
                          color: corDaEquipa(lado),
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          marginBottom: 6,
                        }}
                      >
                        {nomeDaEquipa(lado)}
                      </div>
                      {lista.map((l) => (
                        <button
                          key={l.player_id}
                          type="button"
                          onClick={() => {
                            setSaiId(l.player_id)
                            setErro('')
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '7px 4px',
                            background: 'none',
                            border: 'none',
                            borderBottom: `1px solid ${colors.line}`,
                            color: colors.text,
                            textAlign: 'left',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              width: 38,
                              flexShrink: 0,
                              letterSpacing: 0.5,
                            }}
                            title={nomeDaPosicao(l.assigned_position)}
                          >
                            {siglaDaPosicao(l.assigned_position)}
                          </span>
                          <span className="pb-truncate" style={{ flex: 1, fontSize: 14 }}>
                            {l.name}
                            {l.substitute_for && (
                              <span
                                title={`Já entrou no lugar de ${l.substitute_for}`}
                                style={{ color: colors.teamA, fontSize: 11, marginLeft: 4 }}
                              >
                                🔄
                              </span>
                            )}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: colors.muted,
                              flexShrink: 0,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {l.overall_at_draw ?? '—'}
                          </span>
                          <span style={{ fontSize: 12, color: colors.error, flexShrink: 0 }}>
                            desistiu
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
