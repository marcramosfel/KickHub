import { useCallback, useEffect, useState } from 'react'
import { adminRatingsProgress, adminRevealRatings } from '../../api'
import { formatDia } from '../../lib/format'
import Avatar from '../Avatar'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// A ronda de avaliação do grupo: quem falta entregar e quando abre.
//
// As notas ficam anónimas até ao último jogador entregar — e quem nunca
// vote tranca o grupo todo. Daí o botão de abrir à força: a decisão é do
// admin, mas tem de ser possível tomá-la.
function RondaDeAvaliacao({ pw }) {
  const [p, setP] = useState(null)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(
    async (vivo = { atual: true }) => {
      try {
        const d = await adminRatingsProgress(pw)
        if (vivo.atual) setP(d)
      } catch (e) {
        // sem a 0027 aplicada a secção não aparece, em vez de deitar
        // abaixo o painel todo
        if (vivo.atual) setErro(e.message)
      }
    },
    [pw]
  )

  useEffect(() => {
    const vivo = { atual: true }
    ;(async () => {
      await carregar(vivo)
    })()
    return () => {
      vivo.atual = false
    }
  }, [carregar])

  if (erro || !p) return null

  const faltam = p.em_falta || []
  const abrir = async () => {
    if (
      !window.confirm(
        'Abrir as notas agora? A partir daqui toda a gente vê quem deu o quê — e não há volta atrás.'
      )
    )
      return
    setBusy(true)
    try {
      setP(await adminRevealRatings(pw))
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  const copiar = async () => {
    const texto = [
      'Faltam as notas de: ' + faltam.map((f) => f.name).join(', ') + '.',
      'Assim que o último entregar, as notas abrem e vê-se quem deu o quê.',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      window.prompt('Copia manualmente:', texto)
      return
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div style={{ ...styles.panel, marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          Avaliação do grupo &middot; ronda {p.ronda}
        </span>
        <span
          style={chip(
            p.revelado ? colors.grass : colors.teamA,
            p.revelado ? 'rgba(52,208,88,0.12)' : 'rgba(255,197,49,0.12)'
          )}
        >
          {p.revelado ? 'Notas abertas' : 'Anónimas'}
        </span>
      </div>

      {p.revelado ? (
        <p style={{ ...styles.mutedText, fontSize: 13 }}>
          As notas abriram {p.revelado_em ? `a ${formatDia(p.revelado_em)}` : ''} &mdash; cada um
          vê quem lhe deu o quê, no perfil.
        </p>
      ) : faltam.length === 0 ? (
        <p style={{ ...styles.mutedText, fontSize: 13 }}>
          Ninguém em falta. As notas abrem sozinhas na próxima leitura.
        </p>
      ) : (
        <>
          <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 10 }}>
            Faltam <strong>{faltam.length}</strong> jogadores. Enquanto não entregarem, ninguém
            vê quem deu o quê &mdash; e é isso que faz as notas serem honestas.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {faltam.map((f) => (
              <div
                key={f.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  padding: '3px 0',
                }}
              >
                <span className="pb-truncate" style={{ flex: 1 }}>
                  {f.name}
                </span>
                <span style={{ color: colors.muted, flexShrink: 0 }}>
                  {f.faltam} por dar
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={copiar}
              style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
            >
              {copiado ? 'Lista copiada' : 'Copiar lista para o grupo'}
            </button>
            <button
              type="button"
              onClick={abrir}
              disabled={busy}
              style={
                busy
                  ? disabled({ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' })
                  : { ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }
              }
            >
              {busy ? 'A abrir…' : 'Abrir as notas agora'}
            </button>
          </div>
        </>
      )}
      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}

// Quem ainda não votou no craque/bagre e quem tem notas por dar.
//
// A utilidade disto é dar ao admin uma lista pronta a colar no grupo, por
// isso cada secção tem o seu botão de copiar — e o feedback ("copiado ✓")
// é por chave, senão os dois botões acendiam ao mesmo tempo.

export default function FaltasPanel({ pw, faltas, faltasErr, players = [] }) {
  const [copiado, setCopiado] = useState('')

  const copiarTexto = async (texto, onOk) => {
    try {
      await navigator.clipboard.writeText(texto)
      onOk?.()
    } catch {
      window.prompt('Copia manualmente:', texto)
    }
  }

  const copiarFaltas = (lista, chave) =>
    copiarTexto(lista.map((u) => `${u.name} — ${u.user_id}`).join('\n'), () => {
      setCopiado(chave)
      setTimeout(() => setCopiado(''), 1800)
    })

  const awardPend = faltas?.award_pending || []
  const ratingsPend = faltas?.ratings_pending || []

  return (
    <div>
      {/* a ronda de avaliação do grupo vem primeiro: é a que tem prazo
          social (as notas só abrem quando o último entregar) */}
      <RondaDeAvaliacao pw={pw} />

      {faltasErr && (
        <div style={{ ...styles.panel, marginBottom: 12 }}>
          <p style={{ ...styles.mutedText, fontSize: 13 }}>
            ⚠️ Não consegui carregar ({faltasErr}). Se ainda não aplicaste a migração{' '}
            <strong>0011_quem_falta.sql</strong> no Supabase, é isso que falta.
          </p>
        </div>
      )}

      {!faltasErr && faltas && (
        <>
          {/* 1) craque/bagre da última rodada */}
          <div style={{ ...styles.panel, marginBottom: 12, padding: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                🗳️ Falta votar (craque/bagre)
              </span>
              {faltas.match && (
                <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
                  {faltas.match.voted}/{faltas.match.total} votaram
                </span>
              )}
            </div>

            {!faltas.match ? (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                Ainda não há rodadas registadas.
              </p>
            ) : awardPend.length === 0 ? (
              <p style={{ color: colors.grass, fontSize: 14 }}>
                🎉 Toda a gente que jogou já votou!
              </p>
            ) : (
              <>
                <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                  Rodada de {formatDia(faltas.match.played_at)} — falta o voto de{' '}
                  {awardPend.length}:
                </p>
                {awardPend.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                    }}
                  >
                    <Avatar
                      name={u.name}
                      photo={players.find((p) => p.id === u.id)?.photo_url}
                      size={30}
                    />
                    <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{u.name}</span>
                    <code
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 12,
                        color: colors.muted,
                      }}
                    >
                      {u.user_id}
                    </code>
                  </div>
                ))}
                <button
                  onClick={() => copiarFaltas(awardPend, 'award')}
                  style={{
                    ...styles.buttonGhost,
                    marginTop: 10,
                    fontSize: 13,
                    color: copiado === 'award' ? colors.grass : colors.text,
                    borderColor: copiado === 'award' ? colors.grass : colors.line,
                  }}
                >
                  {copiado === 'award' ? 'Lista copiada ✓' : '📋 Copiar lista para o grupo'}
                </button>
              </>
            )}
          </div>

          {/* 2) avaliações (notas) por dar */}
          <div style={{ ...styles.panel, padding: 12 }}>
            <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 8 }}>
              ⭐ Falta dar notas
            </div>
            {ratingsPend.length === 0 ? (
              <p style={{ color: colors.grass, fontSize: 14 }}>
                🎉 Toda a gente já avaliou todo o grupo!
              </p>
            ) : (
              <>
                <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                  {ratingsPend.length}{' '}
                  {ratingsPend.length === 1 ? 'jogador tem' : 'jogadores têm'} notas por dar:
                </p>
                {ratingsPend.map((u) => (
                  <div
                    key={u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
                  >
                    <Avatar
                      name={u.name}
                      photo={players.find((p) => p.id === u.id)?.photo_url}
                      size={30}
                    />
                    <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{u.name}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.teamA,
                        flexShrink: 0,
                      }}
                    >
                      faltam {u.faltam}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => copiarFaltas(ratingsPend, 'ratings')}
                  style={{
                    ...styles.buttonGhost,
                    marginTop: 10,
                    fontSize: 13,
                    color: copiado === 'ratings' ? colors.grass : colors.text,
                    borderColor: copiado === 'ratings' ? colors.grass : colors.line,
                  }}
                >
                  {copiado === 'ratings'
                    ? 'Lista copiada ✓'
                    : '📋 Copiar lista para o grupo'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
