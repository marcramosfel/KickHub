import { useCallback, useEffect, useState } from 'react'
import { adminRatingsProgress, adminRevealRatings } from '../../api'
import { formatDia } from '../../lib/format'
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

// A aba "Avaliação do grupo".
//
// Tinha mais duas listas e as duas saíram:
//
//   "⭐ Falta dar notas" mostrava EXATAMENTE isto — a mesma query sobre a
//   tabela `ratings`. O nome e o ⭐ enganavam: foi escrito na 0011, antes de
//   existirem as estrelas pós-jogo, e nunca foi renomeado quando elas
//   chegaram. Duas listas com os mesmos nomes e os mesmos números.
//
//   "🗳️ Falta votar (craque/bagre)" listava quem não votou na rodada mais
//   recente — sem olhar ao prazo, que nem existia quando foi escrita. Depois
//   da 0025 a votação fecha sozinha, por isso a lista mostrava gente que já
//   não pode votar. Isso vive agora em Jogos → Votação da rodada, com a
//   participação, o prazo a contar e o lembrete pronto.
export default function FaltasPanel({ pw }) {
  return <RondaDeAvaliacao pw={pw} />
}
