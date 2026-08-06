import { useState } from 'react'
import { setMyPositions } from '../api'
import { nomeDaPosicao, POSITIONS } from '../lib/positions'
import { APP_NAME } from '../config'
import PositionPicker from './PositionPicker'
import { ErrorBox } from './Ui'
import { colors, fonts, styles, disabled } from '../theme'

// Escolha da posição, obrigatória à primeira entrada.
//
// Regra do grupo: escolhe-se uma vez. Por isso o ecrã insiste na
// pré-visualização e pede uma confirmação explícita antes de gravar — depois
// disto só um administrador altera (e o servidor recusa, não é só o botão que
// fica desativado).

export default function PositionSetupScreen({ session, onPedirPin, onDone, onLogout }) {
  const [principal, setPrincipal] = useState(null)
  const [secundaria, setSecundaria] = useState(null)
  const [aceitaOutras, setAceitaOutras] = useState(true)
  const [passo, setPasso] = useState('escolher') // escolher | confirmar
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [naoGuardou, setNaoGuardou] = useState(false)

  // Clicar numa marca: a primeira escolha é a principal, a segunda a
  // secundária. Voltar a clicar numa já escolhida limpa-a.
  const escolher = (id) => {
    setErro('')
    // Limpar a principal promove a secundária. Sem isto ficava-se com uma
    // secundária órfã: o campo mostrava uma marca acesa, o "Continuar"
    // desativado e nenhuma mensagem a explicar o que faltava.
    if (id === principal) {
      setPrincipal(secundaria)
      setSecundaria(null)
      return
    }
    if (id === secundaria) return setSecundaria(null)
    if (!principal) return setPrincipal(id)
    setSecundaria(id)
  }

  const guardar = async () => {
    if (!principal) {
      setErro('Escolhe pelo menos a posição principal.')
      return
    }
    // Sessão vinda do "lembrar-me" não traz PIN em memória — gravar a
    // posição exige-o, e é uma escolha que só se faz uma vez.
    const pin = session.pin || (await onPedirPin?.('Vais gravar a tua posição.'))
    if (!pin) return
    setBusy(true)
    setErro('')
    try {
      await setMyPositions(session.id, pin, principal, secundaria, aceitaOutras)
      onDone({
        primary_position: principal,
        secondary_position: secundaria,
        accepts_other_positions: aceitaOutras,
        position_status: 'PENDING_REVIEW',
      })
    } catch (err) {
      // Já tinha posição noutro dispositivo: segue em frente em vez de prender
      // a pessoa num ecrã de erro sem saída.
      if (err.code === 'POSFIXA') onDone({ position_status: 'PENDING_REVIEW' })
      else {
        setErro(err.message)
        // Rede em baixo ou migração das posições ainda por aplicar: este ecrã
        // aparece a toda a gente no login e o "Sair" só devolve ao login, por
        // isso sem uma saída ninguém entrava na app. Abre-se a porta só depois
        // de a gravação falhar mesmo — e volta a perguntar-se no próximo login.
        setNaoGuardou(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const resumo = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        borderRadius: 12,
        background: '#0C1915',
        border: `1px solid ${colors.line}`,
      }}
    >
      <Linha rotulo="Posição principal" valor={nomeDaPosicao(principal)} cor={colors.grass} />
      <Linha
        rotulo="Posição secundária"
        valor={secundaria ? nomeDaPosicao(secundaria) : 'Nenhuma'}
        cor={secundaria ? colors.teamA : colors.muted}
      />
      <Linha
        rotulo="Aceita jogar noutras posições"
        valor={aceitaOutras ? 'Sim' : 'Não'}
        cor={colors.text}
      />
    </div>
  )

  return (
    <div style={{ ...styles.page, maxWidth: 560 }}>
      <div style={{ textAlign: 'center', margin: '18px 0 22px' }}>
        <div style={{ fontSize: 30, marginBottom: 6 }} aria-hidden>
          🧭
        </div>
        <h1 style={{ ...styles.title, fontSize: 22 }}>
          Onde jogas na <span style={{ color: colors.grass }}>{APP_NAME.accent}</span>?
        </h1>
        <p style={{ ...styles.mutedText, marginTop: 8, fontSize: 14 }}>
          Olá, {session.name}. Antes de entrares, diz-nos a tua posição — é o que faz o sorteio
          montar equipas a sério, e não só ao acaso.
        </p>
      </div>

      {passo === 'escolher' && (
        <div style={styles.panel}>
          <p style={{ fontSize: 14, marginBottom: 14 }}>
            Toca na tua <strong style={{ color: colors.grass }}>posição principal</strong>. Se
            quiseres, toca depois numa segunda para a{' '}
            <strong style={{ color: colors.teamA }}>secundária</strong>.
          </p>

          <PositionPicker principal={principal} secundaria={secundaria} onPick={escolher} />

          {/* alternativa em lista: o campo é bonito mas nem toda a gente
              consegue tocar num alvo redondo — e leitores de ecrã preferem isto */}
          <details style={{ marginTop: 14 }}>
            <summary
              style={{
                fontSize: 13,
                color: colors.muted,
                cursor: 'pointer',
                padding: '6px 0',
              }}
            >
              Preferes escolher numa lista?
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {POSITIONS.map((p) => {
                const on = p.id === principal || p.id === secundaria
                const cor = p.id === principal ? colors.grass : colors.teamA
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => escolher(p.id)}
                    aria-pressed={on}
                    // `aria-pressed` sozinho não distingue principal de
                    // secundária — quem ouve o ecrã só sabia que estava "ativo"
                    aria-label={`${p.label}${
                      p.id === principal
                        ? ' — posição principal'
                        : p.id === secundaria
                          ? ' — posição secundária'
                          : ''
                    }`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '9px 13px',
                      borderRadius: 999,
                      minHeight: 40,
                      border: `1px solid ${on ? cor : colors.line}`,
                      background: on ? 'rgba(255,255,255,0.06)' : '#0C1915',
                      color: on ? cor : colors.text,
                      fontSize: 14,
                      fontWeight: on ? 700 : 400,
                    }}
                  >
                    <span aria-hidden>{p.icon}</span>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </details>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginTop: 18,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={aceitaOutras}
              onChange={(e) => setAceitaOutras(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: colors.grass, marginTop: 2 }}
            />
            <span>
              Sou versátil — se for preciso, jogo noutra posição.
              <span style={{ display: 'block', color: colors.muted, fontSize: 12, marginTop: 2 }}>
                Ajuda o sorteio a equilibrar as equipas. Desmarcado, ficas quase sempre nas tuas
                posições.
              </span>
            </span>
          </label>

          {principal && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...styles.label, marginBottom: 8 }}>Pré-visualização</div>
              {resumo}
            </div>
          )}

          {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}

          <button
            type="button"
            onClick={() => (principal ? setPasso('confirmar') : setErro('Escolhe a tua posição principal.'))}
            style={principal ? { ...styles.button, marginTop: 16 } : disabled({ ...styles.button, marginTop: 16 })}
            disabled={!principal}
          >
            Continuar
          </button>
        </div>
      )}

      {passo === 'confirmar' && (
        <div style={{ ...styles.panel, borderColor: colors.teamA }}>
          <div
            style={{
              fontFamily: fonts.title,
              letterSpacing: 1,
              fontSize: 16,
              marginBottom: 10,
            }}
          >
            ⚠️ Confirma estas posições
          </div>
          {resumo}
          <p style={{ fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
            Confirmas estas posições? Depois de guardar, apenas um administrador poderá alterá-las.
          </p>

          {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}

          <button
            type="button"
            onClick={guardar}
            disabled={busy}
            style={busy ? disabled({ ...styles.button, marginTop: 14 }) : { ...styles.button, marginTop: 14 }}
          >
            {busy ? 'A guardar…' : 'Sim, confirmo'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPasso('escolher')
              setErro('')
            }}
            disabled={busy}
            style={{ ...styles.buttonGhost, marginTop: 8 }}
          >
            Voltar e mudar
          </button>

          {naoGuardou && (
            <>
              <button
                type="button"
                onClick={() => onDone({})}
                disabled={busy}
                style={{ ...styles.buttonGhost, marginTop: 8 }}
              >
                Entrar sem guardar a posição
              </button>
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
                Se não der mesmo para guardar agora, entra na mesma — voltamos a perguntar no
                próximo início de sessão.
              </p>
            </>
          )}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <button
          type="button"
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
    </div>
  )
}

function Linha({ rotulo, valor, cor }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 14,
        alignItems: 'baseline',
      }}
    >
      <span style={{ color: colors.muted, flexShrink: 0 }}>{rotulo}</span>
      <span className="pb-truncate" style={{ color: cor, fontWeight: 700, textAlign: 'right' }}>
        {valor}
      </span>
    </div>
  )
}
