import { useEffect, useRef, useState } from 'react'
import {
  getMatches,
  getMyAwardVotes,
  getPlayers,
  getPublishedDraw,
  updatePhoto,
} from '../api'
import { fileToDataURL } from '../lib/image'
import { ADMIN_NAME, APP_NAME } from '../config'
import Avatar from './Avatar'
import DrawView from './DrawView'
import { colors, fonts, styles } from '../theme'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function HomeScreen({ session, onLogout, onRate, onAdmin, onStats }) {
  const [players, setPlayers] = useState(null)
  const [draw, setDraw] = useState(null)
  const [pendingVotes, setPendingVotes] = useState(0)
  const [error, setError] = useState('')

  const fileRef = useRef(null)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [photoErr, setPhotoErr] = useState('')

  const load = () =>
    Promise.all([
      getPlayers(),
      getPublishedDraw(),
      // não-fatais: se a migração 0002 ainda não estiver aplicada, a Home continua a funcionar
      getMatches().catch(() => []),
      getMyAwardVotes(session.id, session.pin).catch(() => []),
    ])
      .then(([pls, d, ms, mv]) => {
        setPlayers(pls || [])
        setDraw(d)
        const votados = mv || []
        setPendingVotes(
          (ms || []).filter(
            (m) =>
              m.players.length >= 3 &&
              m.players.some((p) => p.player_id === session.id) &&
              !votados.includes(m.id)
          ).length
        )
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite voltar a escolher o mesmo ficheiro
    if (!file) return
    setPhotoErr('')
    setSavingPhoto(true)
    try {
      const dataUrl = await fileToDataURL(file)
      await updatePhoto(session.id, session.pin, dataUrl)
      await load()
    } catch (err) {
      setPhotoErr(err.message)
    } finally {
      setSavingPhoto(false)
    }
  }

  if (players === null) {
    return (
      <div style={styles.page}>
        <p style={{ ...styles.mutedText, textAlign: 'center', marginTop: 60 }}>
          {error || 'A carregar…'}
        </p>
      </div>
    )
  }

  const me = players.find((p) => p.id === session.id)
  const others = players.filter((p) => p.id !== session.id)

  return (
    <div style={styles.page}>
      {/* topo */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <h1 style={{ ...styles.title, fontSize: 22 }}>
          {APP_NAME.main} <span style={{ color: colors.grass }}>{APP_NAME.accent}</span>
        </h1>
        <button
          onClick={onLogout}
          style={{
            background: 'none',
            border: 'none',
            color: colors.muted,
            fontSize: 13,
            textDecoration: 'underline',
          }}
        >
          Sair
        </button>
      </div>

      {/* cartão do próprio */}
      <div style={{ ...styles.panel, display: 'flex', alignItems: 'center', gap: 14 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => !savingPhoto && fileRef.current?.click()}
          title="Trocar foto"
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: savingPhoto ? 'wait' : 'pointer',
            lineHeight: 0,
            flexShrink: 0,
          }}
        >
          <Avatar name={session.name} photo={me?.photo_url} size={64} />
          <span
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: colors.grass,
              border: `2px solid ${colors.panel}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
            }}
          >
            {savingPhoto ? '…' : '📷'}
          </span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{session.name}</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
            {me?.avg != null ? (
              <>
                Média do grupo:{' '}
                <span style={{ color: colors.grass, fontWeight: 700 }}>
                  {Number(me.avg).toFixed(2)}
                </span>{' '}
                ({me.votes} {Number(me.votes) === 1 ? 'voto' : 'votos'})
              </>
            ) : (
              'Ainda sem votos'
            )}
          </div>
          <div
            style={{
              display: 'inline-block',
              marginTop: 6,
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: session.voted ? 'rgba(52,208,88,0.12)' : 'rgba(255,197,49,0.12)',
              color: session.voted ? colors.grass : colors.teamA,
            }}
          >
            {session.voted ? 'Avaliação feita ✓' : 'Avaliação pendente'}
          </div>
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => !savingPhoto && fileRef.current?.click()}
              disabled={savingPhoto}
              style={{
                background: 'none',
                border: 'none',
                color: colors.muted,
                fontSize: 13,
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              {savingPhoto ? 'A guardar foto…' : '📷 Trocar foto'}
            </button>
            {photoErr && (
              <p style={{ ...styles.errorText, fontSize: 13, marginTop: 4 }}>{photoErr}</p>
            )}
          </div>
        </div>
      </div>

      {/* votação de craque/bagre pendente */}
      {pendingVotes > 0 && (
        <div style={{ ...styles.panel, marginTop: 12, border: `1px solid ${colors.teamA}` }}>
          <p style={{ fontSize: 14, marginBottom: 10 }}>
            👑🐟 A votação do craque e do bagre da rodada está aberta — falta o teu voto!
          </p>
          <button style={styles.button} onClick={() => onStats('rodadas')}>
            Votar agora
          </button>
        </div>
      )}

      {/* estatísticas */}
      <button
        style={{ ...styles.buttonGhost, marginTop: 12 }}
        onClick={() => onStats('geral')}
      >
        📊 Estatísticas da pelada
      </button>

      {/* aviso de avaliação pendente */}
      {!session.voted && others.length > 0 && (
        <div style={{ ...styles.panel, marginTop: 12, borderColor: colors.teamA }}>
          <p style={{ fontSize: 14, marginBottom: 10 }}>
            Falta dares as tuas notas ao grupo — é rápido e só se faz uma vez.
          </p>
          <button style={styles.button} onClick={onRate}>
            Avaliar agora
          </button>
        </div>
      )}

      {/* último sorteio */}
      <h2 style={{ ...styles.title, fontSize: 17, margin: '24px 0 10px' }}>Último sorteio</h2>
      {draw ? (
        <div>
          <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 10 }}>
            Publicado a {formatDate(draw.created_at)}
          </p>
          <DrawView A={draw.team_a} B={draw.team_b} />
        </div>
      ) : (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
          <p style={styles.mutedText}>Ainda não há sorteio publicado.</p>
        </div>
      )}

      {/* classificação */}
      <h2 style={{ ...styles.title, fontSize: 17, margin: '24px 0 10px' }}>
        Classificação do grupo
      </h2>
      <div style={{ ...styles.panel, padding: 8 }}>
        {players.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 8px',
              borderBottom: i < players.length - 1 ? `1px solid ${colors.line}` : 'none',
              background: p.id === session.id ? 'rgba(52,208,88,0.06)' : 'transparent',
              borderRadius: 8,
            }}
          >
            <span
              style={{
                fontFamily: fonts.title,
                color: colors.muted,
                width: 22,
                textAlign: 'center',
                fontSize: 14,
              }}
            >
              {i + 1}
            </span>
            <Avatar name={p.name} photo={p.photo_url} size={36} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: p.id === session.id ? 700 : 400 }}>
              {p.name}
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {p.avg != null ? Number(p.avg).toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 12, color: colors.muted, width: 52, textAlign: 'right' }}>
              {p.votes} {Number(p.votes) === 1 ? 'voto' : 'votos'}
            </span>
          </div>
        ))}
        {players.length === 0 && (
          <p style={{ ...styles.mutedText, textAlign: 'center', padding: 14 }}>
            Ainda não há jogadores aprovados.
          </p>
        )}
      </div>

      {session.is_admin && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={onAdmin}
            style={{
              background: 'none',
              border: 'none',
              color: colors.muted,
              fontSize: 13,
              textDecoration: 'underline',
            }}
          >
            Área do admin
          </button>
        </div>
      )}

      <p style={{ ...styles.mutedText, textAlign: 'center', fontSize: 12, marginTop: 24 }}>
        ⚽ Organizado por {ADMIN_NAME}
      </p>
    </div>
  )
}
