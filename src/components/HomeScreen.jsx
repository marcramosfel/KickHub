import { useMemo, useRef, useState } from 'react'
import { changePin, updatePhoto } from '../api'
import { fileToDataURL } from '../lib/image'
import { ordenarJogadoresDeCampo } from '../lib/ranking'
import { PLAYER_TYPE } from '../lib/positions'
import { TITULOS_POR_ID } from '../lib/achievements'
import { tempoAteFechar } from '../lib/voting'
import { ADMIN_NAME } from '../config'
import Avatar from './Avatar'
import AchievementBadge from './AchievementBadge'
import DrawView from './DrawView'
import Feed from './Feed'
import NextMatch from './NextMatch'
import PlayerCard from './PlayerCard'
import RoundResult from './RoundResult'
import { ErrorBox, SectionTitle, SkeletonCard } from './Ui'
import { colors, fonts, styles, chip } from '../theme'

// Página inicial.
//
// No computador o conteúdo distribui-se pela grelha de 12 colunas: o campo do
// próximo jogo ao lado da contagem regressiva, depois uma fila de destaques e
// outra com o que aconteceu. No telemóvel tudo empilha, pela mesma ordem.

// Uma data inválida não rebenta o `toLocaleDateString` — devolve a string
// "Invalid Date", que o `catch` nunca chega a ver. Daí o teste explícito.
function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Cartão de um líder de categoria (artilheiro, craque, etc.).
function CartaoDestaque({ tituloId, liderancas, jogadores, onProfile }) {
  const t = TITULOS_POR_ID[tituloId]
  const lider = liderancas?.[tituloId]
  if (!t) return null

  const vencedores = (lider?.playerIds || [])
    .map((id) => jogadores.find((j) => j.id === id))
    .filter(Boolean)

  return (
    <div className="pb-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 18 }}>
          {t.icon}
        </span>
        <span
          style={{
            fontFamily: fonts.title,
            fontSize: 12,
            letterSpacing: 1,
            color: t.moldura?.cor || colors.muted,
            textTransform: 'uppercase',
          }}
        >
          {t.titulo}
        </span>
      </div>

      {vencedores.length === 0 ? (
        <p style={{ ...styles.mutedText, fontSize: 13, margin: 'auto 0' }}>
          Ainda sem dados para este título.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vencedores.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => onProfile?.(j.id)}
              aria-label={`Ver perfil de ${j.name}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <Avatar name={j.name} photo={j.photo} size={38} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pb-truncate" style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
                  {j.name}
                </span>
                <span style={{ fontSize: 12, color: colors.muted }}>
                  {lider.valor}{' '}
                  {tituloId === 'artilheiro'
                    ? 'gols'
                    : tituloId === 'rei-assistencias'
                      ? 'assistências'
                      : tituloId === 'rei-craques'
                        ? 'vezes craque'
                        : tituloId === 'rei-vitorias'
                          ? 'vitórias'
                          : 'de overall'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HomeScreen({
  session,
  jogadores,
  liderancas,
  proximoJogo,
  feed,
  draw,
  latestMatch,
  totalRodadas,
  porVotar,
  faltamAvaliar,
  loading,
  error,
  onVotar,
  onRate,
  onProfile,
  onNavigate,
  onPinChanged,
  onRecarregar,
}) {
  const fileRef = useRef(null)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [photoErr, setPhotoErr] = useState('')

  const [pinAberto, setPinAberto] = useState(false)
  const [pinAtual, setPinAtual] = useState('')
  const [pinNovo, setPinNovo] = useState('')
  const [pinConf, setPinConf] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinErr, setPinErr] = useState('')
  const [pinOk, setPinOk] = useState(false)

  const me = useMemo(() => jogadores.find((p) => p.id === session.id), [jogadores, session.id])
  const top5 = useMemo(
    () =>
      ordenarJogadoresDeCampo(
        jogadores.filter((j) => j.playerType !== PLAYER_TYPE.GOALKEEPER)
      ).slice(0, 5),
    [jogadores]
  )
  const meusBadges = useMemo(() => {
    if (!liderancas || !me) return []
    return Object.entries(liderancas)
      .filter(([, v]) => v?.playerIds?.includes(me.id))
      .map(([k]) => TITULOS_POR_ID[k])
      .filter(Boolean)
      .sort((a, b) => a.prioridade - b.prioridade)
  }, [liderancas, me])

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoErr('')
    setSavingPhoto(true)
    try {
      const dataUrl = await fileToDataURL(file)
      await updatePhoto(session.id, session.pin, dataUrl)
      await onRecarregar?.()
    } catch (err) {
      setPhotoErr(err.message)
    } finally {
      setSavingPhoto(false)
    }
  }

  const fecharPin = () => {
    setPinAberto(false)
    setPinAtual('')
    setPinNovo('')
    setPinConf('')
    setPinErr('')
  }

  const guardarPin = async (e) => {
    e.preventDefault()
    setPinErr('')
    if (!/^\d{4}$/.test(pinNovo)) return setPinErr('O PIN novo tem de ter exatamente 4 dígitos.')
    if (pinNovo !== pinConf) return setPinErr('A confirmação não coincide com o PIN novo.')
    setPinBusy(true)
    try {
      await changePin(session.id, pinAtual, pinNovo)
      onPinChanged?.(pinNovo)
      fecharPin()
      setPinOk(true)
      setTimeout(() => setPinOk(false), 3000)
    } catch (err) {
      setPinErr(err.message)
    } finally {
      setPinBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="pb-grid">
        <div className="pb-col-8 pb-col-md-12">
          <SkeletonCard lines={5} />
        </div>
        <div className="pb-col-4 pb-col-md-12">
          <SkeletonCard lines={3} />
        </div>
        <div className="pb-col-12">
          <SkeletonCard lines={4} />
        </div>
      </div>
    )
  }

  if (error) return <ErrorBox>{error}</ErrorBox>

  return (
    <div className="pb-stack" style={{ gap: 22 }}>
      {/* O título da página existe para leitores de ecrã e para a estrutura de
          cabeçalhos fazer sentido; visualmente a Home já se identifica sozinha. */}
      <h1 style={{ ...styles.title, fontSize: 22, margin: 0 }}>
        Olá, <span style={{ color: colors.grass }}>{session.name.split(' ')[0]}</span> 👋
      </h1>

      {/* ---------- 1.ª linha: próximo jogo + contagem ---------- */}
      <section aria-label="Próximo jogo">
        <NextMatch
          jogo={proximoJogo}
          meuId={session.id}
          onPlayerClick={(j) => onProfile?.(j.id)}
        />
      </section>

      {/* ---------- o feed: o que o admin publicou, mais recente primeiro ---------- */}
      {feed?.length > 0 && (
        <section aria-label="Últimas da pelada">
          <SectionTitle>📰 Últimas da pelada</SectionTitle>
          <Feed
            posts={feed}
            proximoJogo={proximoJogo}
            jogadores={jogadores}
            onProfile={onProfile}
            onNavigate={onNavigate}
          />
        </section>
      )}

      {/* ---------- avisos pessoais ---------- */}
      {/* A votação já tem a faixa fixa no topo; este cartão é o reforço para
          quem rolou a Home abaixo sem lhe tocar. */}
      {(porVotar?.length > 0 || faltamAvaliar > 0) && (
        <section className="pb-cards">
          {porVotar?.length > 0 && (
            <div className="pb-card" style={{ borderColor: colors.teamA }}>
              <p style={{ fontSize: 14, marginBottom: 4 }}>
                🗳️ Falta o teu voto na rodada — ⭐ avaliações, 👑 craque e 🐟 bagre.
              </p>
              <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                {(() => {
                  const t = tempoAteFechar(porVotar[0].deadline)
                  return t.conhecido && !t.expirado
                    ? `Fecha em ${t.texto}. Leva menos de um minuto.`
                    : 'Leva menos de um minuto.'
                })()}
              </p>
              <button style={styles.button} onClick={() => onVotar?.(porVotar[0].match_id)}>
                Votar agora
              </button>
            </div>
          )}
          {faltamAvaliar > 0 && (
            <div className="pb-card" style={{ borderColor: colors.teamA }}>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Falta avaliares {faltamAvaliar} {faltamAvaliar === 1 ? 'jogador' : 'jogadores'} — pode
                ser gente nova no grupo.
              </p>
              <button style={styles.button} onClick={onRate}>
                Avaliar agora
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- 2.ª linha: top 5 + líderes de categoria ---------- */}
      <section>
        <SectionTitle>Destaques do grupo</SectionTitle>
        <div className="pb-grid">
          <div className="pb-col-4 pb-col-md-12">
            <div className="pb-card" style={{ height: '100%' }}>
              <div
                style={{
                  fontFamily: fonts.title,
                  fontSize: 12,
                  letterSpacing: 1,
                  color: colors.grass,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                🏅 Top 5 do ranking
              </div>
              {top5.length === 0 ? (
                <p style={{ ...styles.mutedText, fontSize: 13 }}>
                  Ainda não existem estatísticas suficientes.
                </p>
              ) : (
                <div className="pb-stack" style={{ gap: 6 }}>
                  {top5.map((j, i) => (
                    <PlayerCard
                      key={j.id}
                      jogador={j}
                      liderancas={liderancas}
                      rank={i + 1}
                      variante="linha"
                      destacado={j.id === session.id}
                      onClick={() => onProfile?.(j.id)}
                    />
                  ))}
                </div>
              )}
              <button
                style={{ ...styles.buttonGhost, marginTop: 12, fontSize: 13 }}
                onClick={() => onNavigate?.('ranking')}
              >
                Ver ranking completo →
              </button>
            </div>
          </div>

          <div className="pb-col-8 pb-col-md-12">
            <div className="pb-cards pb-row-align">
              <CartaoDestaque
                tituloId="rei-da-pelada"
                liderancas={liderancas}
                jogadores={jogadores}
                onProfile={onProfile}
              />
              <CartaoDestaque
                tituloId="artilheiro"
                liderancas={liderancas}
                jogadores={jogadores}
                onProfile={onProfile}
              />
              <CartaoDestaque
                tituloId="rei-assistencias"
                liderancas={liderancas}
                jogadores={jogadores}
                onProfile={onProfile}
              />
              <CartaoDestaque
                tituloId="rei-craques"
                liderancas={liderancas}
                jogadores={jogadores}
                onProfile={onProfile}
              />
              <CartaoDestaque
                tituloId="paredao"
                liderancas={liderancas}
                jogadores={jogadores}
                onProfile={onProfile}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 3.ª linha: último resultado + último sorteio ---------- */}
      <section>
        <SectionTitle>O que aconteceu</SectionTitle>
        <div className="pb-grid">
          <div className="pb-col-7 pb-col-md-12">
            {latestMatch !== undefined && (
              <RoundResult
                match={latestMatch}
                onHistory={() => onNavigate?.('history')}
                onProfile={(id) => onProfile?.(id, totalRodadas)}
              />
            )}
          </div>

          <div className="pb-col-5 pb-col-md-12">
            <div className="pb-card" style={{ height: '100%' }}>
              <div
                style={{
                  fontFamily: fonts.title,
                  fontSize: 12,
                  letterSpacing: 1,
                  color: colors.grass,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                🎲 Último sorteio
              </div>
              {draw ? (
                <>
                  {formatDate(draw.created_at) && (
                    <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                      Publicado a {formatDate(draw.created_at)}
                    </p>
                  )}
                  <DrawView A={draw.team_a} B={draw.team_b} />
                </>
              ) : (
                <p style={{ ...styles.mutedText, fontSize: 13 }}>Ainda não há sorteio publicado.</p>
              )}
              <button
                style={{ ...styles.buttonGhost, marginTop: 12, fontSize: 13 }}
                onClick={() => onNavigate?.('draws')}
              >
                Ver sorteios →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 4.ª linha: o meu cartão ---------- */}
      <section>
        <SectionTitle>A minha conta</SectionTitle>
        <div className="pb-grid">
          <div className="pb-col-6 pb-col-md-12">
            <div className="pb-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                aria-label="Trocar a minha foto"
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
                <Avatar name={session.name} photo={me?.photo} size={64} />
                <span
                  aria-hidden
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
                <div className="pb-truncate" style={{ fontWeight: 700, fontSize: 18 }}>
                  {session.name}
                </div>
                <div style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  {me?.avg != null ? (
                    <>
                      Média do grupo:{' '}
                      <span style={{ color: colors.grass, fontWeight: 700 }}>
                        {Number(me.avg).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    'Ainda sem votos'
                  )}
                  {me?.overall != null && (
                    <>
                      {' · '}
                      <span style={{ color: colors.teamA, fontWeight: 700 }}>
                        Overall {me.overall}
                      </span>
                    </>
                  )}
                </div>
                {meusBadges.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {meusBadges.map((t) => (
                      <AchievementBadge key={t.id} titulo={t} tamanho="sm" />
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <span
                    style={chip(
                      faltamAvaliar === 0 ? colors.grass : colors.teamA,
                      faltamAvaliar === 0 ? 'rgba(52,208,88,0.12)' : 'rgba(255,197,49,0.12)'
                    )}
                  >
                    {faltamAvaliar === 0 ? 'Avaliação feita ✓' : 'Avaliação pendente'}
                  </span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
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
                  <button
                    type="button"
                    onClick={() => (pinAberto ? fecharPin() : setPinAberto(true))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: colors.muted,
                      fontSize: 13,
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    🔑 {pinAberto ? 'Cancelar' : 'Mudar PIN'}
                  </button>
                </div>
                {photoErr && <ErrorBox style={{ marginTop: 8 }}>{photoErr}</ErrorBox>}
                {pinOk && (
                  <p style={{ color: colors.grass, fontSize: 13, marginTop: 8 }} role="status">
                    PIN alterado ✓ — usa o novo da próxima vez que entrares.
                  </p>
                )}
              </div>
            </div>
          </div>

          {pinAberto && (
            <div className="pb-col-6 pb-col-md-12">
              <form onSubmit={guardarPin} className="pb-card">
                <div
                  style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 4 }}
                >
                  🔑 Mudar o meu PIN
                </div>
                <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                  Esqueceste-te do atual? Pede ao {ADMIN_NAME} para te definir um novo.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['PIN atual', pinAtual, setPinAtual, 'current-password'],
                    ['PIN novo (4 dígitos)', pinNovo, setPinNovo, 'new-password'],
                    ['Repetir o PIN novo', pinConf, setPinConf, 'new-password'],
                  ].map(([ph, val, set, ac]) => (
                    <input
                      key={ph}
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder={ph}
                      aria-label={ph}
                      value={val}
                      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
                      style={styles.input}
                      autoComplete={ac}
                    />
                  ))}
                </div>
                {pinErr && <ErrorBox style={{ marginTop: 10 }}>{pinErr}</ErrorBox>}
                <button
                  type="submit"
                  disabled={pinBusy || !pinAtual || !pinNovo || !pinConf}
                  style={{ ...styles.button, marginTop: 10 }}
                >
                  {pinBusy ? 'A guardar…' : 'Guardar PIN novo'}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      <p style={{ ...styles.mutedText, textAlign: 'center', fontSize: 12, padding: '8px 0 4px' }}>
        ⚽ Organizado por {ADMIN_NAME}
      </p>
    </div>
  )
}
