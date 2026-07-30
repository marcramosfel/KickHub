import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminMatchesUpcoming,
  adminSubstitutePlayer,
  adminSwapPlayers,
  adminUndoSubstitution,
  adminUndoSwap,
} from '../../api'
import { OVERALL_NEUTRO } from '../../lib/drawEngine'
import { formatarDataDoJogo } from '../../lib/countdown'
import { nomeDaPosicao, siglaDaPosicao } from '../../lib/positions'
import {
  corDaEquipa,
  nomeDaEquipa,
  previewReplace,
  previewSwap,
  resumoDeDesistencias,
} from '../../lib/substitutions'
import Avatar from '../Avatar'
import FootballPitch from '../FootballPitch'
import { VantagemAtual } from '../Substitutions'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// Mexidas num sorteio publicado. Continua sem haver re-sorteio: cada ação é
// cirúrgica, fica na auditoria e aparece no feed. São três, e só três:
//   🚑 desistência  — "não posso ir": sai um, entra alguém de fora;
//   🔁 trocar       — um de cada time trocam de lado (com prévia);
//   ➡️ substituir   — sai um, entra alguém de fora, por opção do admin.
// A desistência explica um desequilíbrio; a troca e a substituição são
// decisões — por isso os jogadores veem etiquetas diferentes.

const LADOS = ['A', 'B']

const ACOES = [
  { id: 'desistencia', rotulo: '🚑 Desistência', dica: 'Alguém avisou que não pode ir.' },
  { id: 'trocar', rotulo: '🔁 Trocar de time', dica: 'Um de cada lado trocam entre si.' },
  { id: 'substituir', rotulo: '➡️ Substituir', dica: 'Sai um, entra outro — sem ser desistência.' },
]

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

// Sem a 0021 aplicada, as ações novas chegam como SEMMIGRACAO genérico —
// dizer QUAL o ficheiro falta poupa a caça ao erro.
const erroLegivel = (e) =>
  e?.code === 'SEMMIGRACAO'
    ? 'Falta aplicar a migração 0021_trocas.sql no Supabase (instruções em supabase/APLICAR.md).'
    : e?.message

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
  const [acao, setAcao] = useState('desistencia')
  const [saiId, setSaiId] = useState(null) // quem sai, à espera de substituto
  const [motivo, setMotivo] = useState('')
  const [procura, setProcura] = useState('')
  // troca entre equipas: um escolhido de cada lado
  const [swapSel, setSwapSel] = useState({ A: null, B: null })
  const [motivoTroca, setMotivoTroca] = useState('')

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
    setSwapSel({ A: null, B: null })
    setMotivoTroca('')
  }

  // a desistência e a substituição partilham o fluxo — muda a etiqueta que
  // fica gravada (kind) e o texto de confirmação
  const substituir = async (entra) => {
    if (busy || !jogo || !linhaQueSai) return
    const kind = acao === 'substituir' ? 'TROCA' : 'DESISTENCIA'
    const sai = porId.get(saiId)
    const nomeSai = sai?.name || linhaQueSai.name
    const lugar = linhaQueSai.is_goalkeeper ? 'a baliza' : nomeDaPosicao(linhaQueSai.assigned_position)
    if (
      !window.confirm(
        `${kind === 'DESISTENCIA' ? 'Registar a desistência de' : 'Substituir'} ${nomeSai} e pôr ${entra.name} em ${lugar} (${nomeDaEquipa(linhaQueSai.team)})?\n\n` +
          'A mudança fica visível para todos, com o efeito nas forças à vista.'
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
        motivo,
        kind
      )
      aplicar(jogoNovo)
      cancelar()
      setAviso(`${entra.name} entrou no lugar de ${nomeSai}.`)
      setTimeout(() => setAviso(''), 3000)
      await onDadosAlterados?.()
    } catch (e) {
      setErro(erroLegivel(e))
    } finally {
      setBusy(false)
    }
  }

  // troca entre equipas, com prévia calculada antes de confirmar
  const previa = useMemo(
    () => (swapSel.A && swapSel.B ? previewSwap(jogo, swapSel.A, swapSel.B) : null),
    [jogo, swapSel]
  )

  const confirmarTroca = async () => {
    if (busy || !jogo || !previa?.valido) return
    if (
      !window.confirm(
        `Trocar ${previa.a.nome} (${nomeDaEquipa(previa.a.de)}) com ${previa.b.nome} (${nomeDaEquipa(previa.b.de)})?\n\n` +
          'Cada um assume o lugar do outro. A troca fica visível para todos.'
      )
    )
      return
    setBusy(true)
    setErro('')
    try {
      aplicar(await adminSwapPlayers(pw, jogo.id, swapSel.A, swapSel.B, motivoTroca))
      cancelar()
      setAviso('Troca feita — forças e equilíbrio recalculados.')
      setTimeout(() => setAviso(''), 3000)
      await onDadosAlterados?.()
    } catch (e) {
      setErro(erroLegivel(e))
    } finally {
      setBusy(false)
    }
  }

  const desfazer = async (t) => {
    if (busy) return
    const ehSwap = t.kind === 'SWAP'
    const pergunta = ehSwap
      ? `Desfazer a troca? ${t.saiNome} e ${t.entraNome} voltam aos times de origem.`
      : `Desfazer? ${t.saiNome} volta ao lugar de ${t.entraNome}.`
    if (!window.confirm(pergunta)) return
    setBusy(true)
    setErro('')
    try {
      aplicar(ehSwap ? await adminUndoSwap(pw, t.id) : await adminUndoSubstitution(pw, t.id))
      setAviso(ehSwap ? 'Troca desfeita.' : 'Substituição desfeita.')
      setTimeout(() => setAviso(''), 3000)
      await onDadosAlterados?.()
    } catch (e) {
      setErro(erroLegivel(e))
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
          <strong>0021_trocas.sql</strong> (e as anteriores) no SQL Editor do Supabase — instruções
          em <code>supabase/APLICAR.md</code>.
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
          Mexidas num sorteio já publicado — o sorteio <strong>não</strong> é refeito, e cada
          mudança fica visível para todos, com o efeito nas forças à vista.
        </p>

        <div role="radiogroup" aria-label="O que aconteceu?" className="pb-cards-sm" style={{ marginBottom: 12 }}>
          {ACOES.map((a) => {
            const ativa = acao === a.id
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={ativa}
                onClick={() => {
                  setAcao(a.id)
                  cancelar()
                  setErro('')
                }}
                style={{
                  ...styles.panel,
                  padding: 10,
                  textAlign: 'left',
                  font: 'inherit',
                  color: colors.text,
                  cursor: 'pointer',
                  borderColor: ativa ? colors.grass : colors.line,
                  background: ativa ? 'rgba(52,208,88,0.07)' : styles.panel.background,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{a.rotulo}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{a.dica}</div>
              </button>
            )
          })}
        </div>

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
                Mudanças feitas ({resumo.total})
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
                        {t.kind === 'SWAP' ? (
                          <>
                            <strong>{t.saiNome}</strong> ⇄ <strong>{t.entraNome}</strong>
                          </>
                        ) : (
                          <>
                            <span style={{ color: colors.muted, textDecoration: 'line-through' }}>
                              {t.saiNome}
                            </span>{' '}
                            → <strong>{t.entraNome}</strong>
                          </>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: colors.muted }}>
                        {t.equipa} · {t.ehGoleiro ? 'Goleiro' : nomeDaPosicao(t.slot)} ·{' '}
                        {t.kind === 'SWAP'
                          ? 'trocaram de time'
                          : t.kind === 'TROCA'
                            ? 'substituição'
                            : 'desistência'}
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
                {disponiveis.map((j) => {
                  // o efeito nas forças ANTES de confirmar, como na troca —
                  // o confirm promete "com o efeito à vista" e é aqui que ele
                  // aparece
                  const p = previewReplace(jogo, saiId, overallDe(j))
                  return (
                    <div
                      key={j.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 4px',
                        borderBottom: `1px solid ${colors.line}`,
                        flexWrap: 'wrap',
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
                          {p && (
                            <>
                              {' · '}
                              {nomeDaEquipa(p.lado)} {p.antes[p.lado === 'A' ? 'forcaA' : 'forcaB']}
                              {' → '}
                              <strong style={{ color: colors.text }}>
                                {p.depois[p.lado === 'A' ? 'forcaA' : 'forcaB']}
                              </strong>
                              {!p.depois.equilibrado && (
                                <span style={{ color: colors.error }}>
                                  {' '}
                                  · fica {p.depois.pct.toFixed(1)}% desequilibrado
                                </span>
                              )}
                            </>
                          )}
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
                  )
                })}
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
                {acao === 'trocar'
                  ? 'Quem troca com quem?'
                  : acao === 'substituir'
                    ? 'Quem sai?'
                    : 'Quem desistiu?'}
              </div>
              <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 8 }}>
                {acao === 'trocar'
                  ? 'Toca num jogador de cada equipa — vês o efeito antes de confirmar.'
                  : acao === 'substituir'
                    ? 'Toca no jogador que vai dar o lugar a alguém de fora.'
                    : 'Toca no jogador que já não pode ir.'}
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
                      {lista.map((l) => {
                        const marcadoParaTroca = acao === 'trocar' && swapSel[lado] === l.player_id
                        return (
                          <button
                            key={l.player_id}
                            type="button"
                            aria-pressed={acao === 'trocar' ? marcadoParaTroca : undefined}
                            onClick={() => {
                              setErro('')
                              if (acao === 'trocar') {
                                // um por equipa; tocar outra vez desmarca
                                setSwapSel((s) => ({
                                  ...s,
                                  [lado]: s[lado] === l.player_id ? null : l.player_id,
                                }))
                              } else {
                                setSaiId(l.player_id)
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              width: '100%',
                              padding: '7px 4px',
                              background: marcadoParaTroca ? '#0C1915' : 'none',
                              border: 'none',
                              borderRadius: marcadoParaTroca ? 8 : 0,
                              outline: marcadoParaTroca ? `1px solid ${corDaEquipa(lado)}` : 'none',
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
                            <span
                              style={{
                                fontSize: 12,
                                color: acao === 'trocar' ? colors.teamA : colors.error,
                                flexShrink: 0,
                              }}
                            >
                              {acao === 'trocar' ? (marcadoParaTroca ? '⇄ marcado' : 'trocar') : acao === 'substituir' ? 'sai' : 'desistiu'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              {/* ---------- prévia da troca entre equipas ---------- */}
              {acao === 'trocar' && previa && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${previa.valido ? colors.grass : colors.error}55`,
                    background: previa.valido ? 'rgba(52,208,88,0.06)' : 'rgba(255,90,90,0.06)',
                  }}
                >
                  {previa.valido ? (
                    <>
                      <div style={{ fontSize: 14, marginBottom: 8 }}>
                        <strong>{previa.a.nome}</strong> vai para {nomeDaEquipa(previa.a.para)} (
                        {nomeDaPosicao(previa.a.posicao)}) ·{' '}
                        <strong>{previa.b.nome}</strong> vai para {nomeDaEquipa(previa.b.para)} (
                        {nomeDaPosicao(previa.b.posicao)})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: colors.muted }}>antes:</span>
                        <span style={chip(colors.muted)}>
                          ⚫ {previa.antes.forcaA} vs ⚪ {previa.antes.forcaB} · Δ {previa.antes.diff}
                        </span>
                        <VantagemAtual vantagem={previa.antes} comNumeros={false} />
                        <span aria-hidden style={{ color: colors.muted }}>→</span>
                        <span style={{ fontSize: 12, color: colors.muted }}>depois:</span>
                        <span style={chip(previa.depois.diff <= previa.antes.diff ? colors.grass : colors.teamA)}>
                          ⚫ {previa.depois.forcaA} vs ⚪ {previa.depois.forcaB} · Δ {previa.depois.diff}
                        </span>
                        <VantagemAtual vantagem={previa.depois} comNumeros={false} />
                      </div>
                      {!previa.depois.equilibrado && (
                        <p style={{ fontSize: 12, color: colors.error, margin: '0 0 10px' }}>
                          ⚠️ Com esta troca as equipas ficam desequilibradas ({previa.depois.pct.toFixed(1)}%).
                        </p>
                      )}
                      <label style={styles.label} htmlFor="motivo-troca">
                        Motivo (opcional)
                      </label>
                      <input
                        id="motivo-troca"
                        style={{ ...styles.input, marginBottom: 10 }}
                        value={motivoTroca}
                        onChange={(e) => setMotivoTroca(e.target.value)}
                        placeholder="Equilibrar, pedido dos jogadores…"
                        maxLength={80}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={confirmarTroca}
                          disabled={busy}
                          style={busy ? disabled({ ...styles.button, flex: '2 1 160px', width: 'auto' }) : { ...styles.button, flex: '2 1 160px', width: 'auto' }}
                        >
                          {busy ? 'A trocar…' : '🔁 Confirmar troca'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelar}
                          style={{ ...styles.buttonGhost, flex: '1 1 110px', width: 'auto' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: colors.error, margin: 0 }}>⛔ {previa.motivo}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
