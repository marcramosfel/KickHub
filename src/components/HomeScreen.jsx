import { useMemo, useRef, useState } from 'react'
import { changePin, setMyGkRotation, updatePhoto } from '../api'
import { fileToDataURL } from '../lib/image'
import { estadoDaPelada, ESTADO_PELADA } from '../lib/estadoDaPelada'
import { PLAYER_TYPE } from '../lib/positions'
import { TITULOS_POR_ID } from '../lib/achievements'
import { tempoAteFechar } from '../lib/voting'
import { nomeDaEquipa } from '../lib/substitutions'
import { ADMIN_NAME } from '../config'
import Avatar from './Avatar'
import AchievementBadge from './AchievementBadge'
import Contestar from './Contestar'
import Disponibilidade from './Disponibilidade'
import FraseDoDia from './FraseDoDia'
import NextMatch from './NextMatch'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles, chip } from '../theme'

// Página inicial.
//
// A filosofia mudou: a Home mostra o ESTADO ATUAL da pelada, não o histórico.
//
// Antes tinha o feed, o último resultado, o último sorteio, os campeões da
// semana e cinco cartões de líderes — e boa parte disso falava do MESMO jogo
// por outras palavras. Era comprida, repetida, e não respondia depressa às
// perguntas que quem abre a app tem: qual é o próximo jogo, estou convocado,
// há alguma coisa que eu tenha de fazer.
//
// Agora são três blocos, por esta ordem:
//   1. o que está a acontecer AGORA (uma coisa só — ver `lib/estadoDaPelada`)
//   2. vou ou não vou ao próximo jogo
//   3. o próximo jogo, com equipas e contagem regressiva
//   4. a minha conta (foto, PIN, baliza)
//
// O histórico não desapareceu — mudou de sítio: Ranking, Estatísticas,
// Histórico (com o feed no separador "Últimas") e Sorteios.

// ---------- o cartão principal ----------
function EstadoAtual({ estado, latestMatch, onVotar, onRate, onNavigate }) {
  const cor = estado.urgente ? colors.teamA : colors.grass
  const prazo = estado.deadline ? tempoAteFechar(estado.deadline) : null

  const agir = () => {
    if (estado.tipo === ESTADO_PELADA.VOTAR) return onVotar?.(estado.matchId)
    if (estado.tipo === ESTADO_PELADA.AVALIAR) return onRate?.()
    if (estado.destino) return onNavigate?.(estado.destino, { matchId: estado.matchId })
    return undefined
  }

  return (
    <div
      className={`pb-card pb-pop${estado.urgente ? ' pb-pulse' : ''}`}
      style={{
        borderColor: cor,
        background: estado.urgente ? 'rgba(255,197,49,0.06)' : 'rgba(52,208,88,0.05)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span
          aria-hidden
          className="pb-float"
          style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}
        >
          {estado.icone}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...styles.title, fontSize: 19, lineHeight: 1.2 }}>{estado.titulo}</div>

          {/* Um resultado mostra-se com o placar, não com uma frase. */}
          {estado.tipo === ESTADO_PELADA.RESULTADO && latestMatch ? (
            <div
              style={{
                fontFamily: fonts.title,
                fontSize: 20,
                marginTop: 8,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'baseline',
              }}
            >
              <span>{nomeDaEquipa('A')}</span>
              <span style={{ color: colors.grass }}>
                {latestMatch.score_a} × {latestMatch.score_b}
              </span>
              <span>{nomeDaEquipa('B')}</span>
            </div>
          ) : (
            estado.texto && (
              <p style={{ ...styles.mutedText, fontSize: 14, marginTop: 6 }}>{estado.texto}</p>
            )
          )}

          {prazo?.conhecido && !prazo.expirado && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 6 }}>
              Fecha em {prazo.texto}. Leva menos de um minuto.
            </p>
          )}

          {estado.acao && (
            <button
              type="button"
              onClick={agir}
              className="pb-tap"
              style={{ ...styles.button, marginTop: 14, width: 'auto', padding: '12px 22px' }}
            >
              {estado.acao}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function HomeScreen({
  session,
  jogadores,
  liderancas,
  proximoJogo,
  convocatoria,
  curiosidades,
  latestMatch,
  porVotar,
  faltamAvaliar,
  loading,
  error,
  token,
  onVotar,
  onPedirPin,
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

  // "Aceito ir à baliza no rodízio".
  //
  // A coluna nasce a `true` para toda a gente, ou seja, o sistema assume
  // que todos aceitam. Sem este botão, quem não quer não tinha como dizer —
  // e o rodízio calhava-lhe na mesma.
  const [golOk, setGolOk] = useState(null) // null = ainda não mexemos nisto
  const [golBusy, setGolBusy] = useState(false)

  const me = useMemo(() => jogadores.find((p) => p.id === session.id), [jogadores, session.id])

  // o que o servidor diz, até o próprio mudar aqui
  const golAtual = golOk ?? me?.gkRotationOk ?? true

  const estado = useMemo(
    () => estadoDaPelada({ proximoJogo, latestMatch, porVotar, faltamAvaliar }),
    [proximoJogo, latestMatch, porVotar, faltamAvaliar]
  )

  const mudarGol = async () => {
    if (golBusy) return
    const novo = !golAtual
    const pin = session.pin || (await onPedirPin?.('Vais mudar a tua preferência de baliza.'))
    if (!pin) return
    setGolBusy(true)
    try {
      await setMyGkRotation(session.id, pin, novo)
      setGolOk(novo)
      await onRecarregar?.()
    } catch (err) {
      setPhotoErr(err.message)
    } finally {
      setGolBusy(false)
    }
  }

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
    // Sessão vinda do "lembrar-me" não tem PIN em memória — trocar a foto
    // exige-o, e sem este pedido a chamada falhava com "Nome ou PIN
    // incorretos" a quem nunca escreveu nenhum PIN.
    const pin = session.pin || (await onPedirPin?.('Vais trocar a tua foto.'))
    if (!pin) return
    setSavingPhoto(true)
    try {
      const dataUrl = await fileToDataURL(file)
      await updatePhoto(session.id, pin, dataUrl)
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
      <div className="pb-stack">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
      </div>
    )
  }

  if (error) return <ErrorBox>{error}</ErrorBox>

  return (
    <div className="pb-stack" style={{ gap: 20 }}>
      <h1 style={{ ...styles.title, fontSize: 22, margin: 0 }}>
        Olá, <span style={{ color: colors.grass }}>{session.name.split(' ')[0]}</span> 👋
      </h1>

      {/* A provocação do dia — uma linha, tirada dos números reais. */}
      <FraseDoDia curiosidades={curiosidades} playerId={session.id} />

      {/* ---------- 1. o estado da pelada, uma coisa só ---------- */}
      <EstadoAtual
        estado={estado}
        latestMatch={latestMatch}
        onVotar={onVotar}
        onRate={onRate}
        onNavigate={onNavigate}
      />

      {/* ---------- 2. vais jogar? ---------- */}
      <Disponibilidade
        convocatoria={convocatoria}
        session={session}
        token={token}
        onPedirPin={onPedirPin}
        onRespondido={onRecarregar}
      />

      {/* ---------- 3. o próximo jogo ---------- */}
      <section aria-label="Próximo jogo">
        <NextMatch
          jogo={proximoJogo}
          meuId={session.id}
          onPlayerClick={(j) => onProfile?.(j.id)}
        />
      </section>

      {/* ---------- 4. o sorteio é justo? ---------- */}
      {/* Logo a seguir às equipas, que é onde a pergunta nasce. */}
      <Contestar
        jogo={proximoJogo}
        session={session}
        token={token}
        onPedirPin={onPedirPin}
        onAtualizado={onRecarregar}
      />

      {/* ---------- 5. a minha conta ---------- */}
      <section>
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
                {/* preferência de baliza — só faz sentido a quem joga na
                    linha; um goleiro registado está sempre na baliza */}
                {me?.playerType !== PLAYER_TYPE.GOALKEEPER && (
                  <button
                    type="button"
                    onClick={mudarGol}
                    disabled={golBusy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      marginTop: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: `1px solid ${golAtual ? colors.line : colors.teamA}`,
                      background: golAtual ? '#0C1915' : 'rgba(255,197,49,0.08)',
                      color: colors.text,
                      font: 'inherit',
                      fontSize: 13,
                      textAlign: 'left',
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 16 }}>{golAtual ? '🧤' : '🚫'}</span>
                    <span style={{ flex: 1 }}>
                      {golAtual ? 'Aceito ir à baliza no rodízio' : 'Não vou à baliza'}
                      <span style={{ display: 'block', fontSize: 11, color: colors.muted }}>
                        {golAtual
                          ? 'Podes ser escolhido para começar no gol nos jogos sem goleiro fixo.'
                          : 'Só te calha se não houver mais ninguém disponível.'}
                      </span>
                    </span>
                    <span style={{ color: colors.teamA, flexShrink: 0 }}>
                      {golBusy ? '…' : 'mudar'}
                    </span>
                  </button>
                )}

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

      {/* O histórico saiu da Home e vive nos ecrãs próprios — daqui fica só o
          caminho para lá, para quem o vinha procurar aqui. */}
      <div className="pb-stagger" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { id: 'ranking', rotulo: '🏅 Ranking' },
          { id: 'history', rotulo: '📜 Rodadas e últimas' },
          { id: 'stats', rotulo: '📊 Estatísticas' },
          { id: 'draws', rotulo: '🎲 Sorteios' },
        ].map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onNavigate?.(l.id)}
            className="pb-tap"
            style={{ ...styles.buttonGhost, width: 'auto', flex: '1 1 150px', fontSize: 13 }}
          >
            {l.rotulo}
          </button>
        ))}
      </div>

      <p style={{ ...styles.mutedText, textAlign: 'center', fontSize: 12, padding: '8px 0 4px' }}>
        ⚽ Organizado por {ADMIN_NAME}
      </p>
    </div>
  )
}
