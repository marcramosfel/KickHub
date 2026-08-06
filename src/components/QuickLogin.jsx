import { useEffect, useMemo, useState } from 'react'
import { getPlayers, issueDeviceToken, login } from '../api'
import { etiquetaDoDispositivo, guardarToken } from '../lib/router'
import Avatar from './Avatar'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles, disabled } from '../theme'

// Entrar a partir de um link, sem escrever o nome.
//
// O ecrã de login normal pede nome (ou ID) e PIN — teclado, memória e uma
// hipótese de errar o nome. Aqui, quem chegou por um link já disse a que
// jogo vem: basta escolher-se numa lista e dar o PIN. São dois toques.
//
// O "lembrar-me" guarda um TOKEN emitido pelo servidor, nunca o PIN. Esse
// token autoriza ler e votar; trocar PIN, trocar foto ou entrar no admin
// continuam a exigir o PIN escrito. É o que permite que, da segunda vez, o
// link abra direto na cédula.

export default function QuickLogin({ onEntrar, onCancelar, motivo }) {
  const [jogadores, setJogadores] = useState(null)
  const [procura, setProcura] = useState('')
  const [escolhido, setEscolhido] = useState(null)
  const [pin, setPin] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    getPlayers()
      .then((l) => setJogadores(l || []))
      .catch((e) => {
        setJogadores([])
        setErro(e.message)
      })
  }, [])

  const visiveis = useMemo(() => {
    const termo = procura.trim().toLowerCase()
    const lista = jogadores || []
    if (!termo) return lista
    return lista.filter((j) => String(j.name || '').toLowerCase().includes(termo))
  }, [jogadores, procura])

  const entrar = async (e) => {
    e?.preventDefault?.()
    if (!escolhido || pin.length !== 4 || busy) return
    setErro('')
    setBusy(true)
    try {
      // O login normal aceita nome OU user_id; aqui passa-se o nome do
      // jogador escolhido na lista, que é o que a lista tem.
      const sessao = await login(escolhido.name, pin)
      let token = null
      if (lembrar) {
        // Falhar a emitir o token não pode impedir a entrada: quem quer é
        // votar, e sem token só perde a comodidade da próxima vez.
        try {
          token = await issueDeviceToken(sessao.id, pin, etiquetaDoDispositivo())
          if (token) guardarToken(token)
        } catch {
          token = null
        }
      }
      onEntrar?.({ ...sessao, pin }, token)
    } catch (err) {
      setErro(err.message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  if (jogadores === null) {
    return (
      <div style={{ ...styles.page, maxWidth: 460 }}>
        <SkeletonCard lines={5} />
      </div>
    )
  }

  return (
    <div style={{ ...styles.page, maxWidth: 460 }}>
      <div style={{ textAlign: 'center', margin: '24px 0 20px' }}>
        <div style={{ fontSize: 34, marginBottom: 6 }} aria-hidden>
          🗳️
        </div>
        <h1 style={{ ...styles.title, fontSize: 22 }}>És tu?</h1>
        <p style={{ ...styles.mutedText, marginTop: 6, fontSize: 14 }}>
          {motivo || 'Escolhe o teu nome para votar na rodada.'}
        </p>
      </div>

      {!escolhido ? (
        <div className="pb-card">
          <input
            style={{ ...styles.input, marginBottom: 12 }}
            placeholder="🔎 procurar o meu nome…"
            aria-label="Procurar o meu nome"
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
          />
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {visiveis.length === 0 ? (
              <p style={{ ...styles.mutedText, fontSize: 13, padding: '10px 0' }}>
                Ninguém com esse nome.
              </p>
            ) : (
              visiveis.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => {
                    setEscolhido(j)
                    setErro('')
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    minHeight: 52,
                    padding: '8px 4px',
                    background: 'none',
                    border: 'none',
                    borderBottom: `1px solid ${colors.line}`,
                    color: colors.text,
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <Avatar name={j.name} photo={j.photo_url} size={34} />
                  <span className="pb-truncate" style={{ flex: 1, fontSize: 15 }}>
                    {j.name}
                  </span>
                  <span aria-hidden style={{ color: colors.muted }}>
                    ›
                  </span>
                </button>
              ))
            )}
          </div>
          {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}
          <button type="button" onClick={onCancelar} style={{ ...styles.link, width: '100%', marginTop: 12 }}>
            Entrar com nome e PIN
          </button>
        </div>
      ) : (
        <form onSubmit={entrar} className="pb-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Avatar name={escolhido.name} photo={escolhido.photo_url} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pb-truncate" style={{ fontFamily: fonts.title, fontSize: 18 }}>
                {escolhido.name}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEscolhido(null)
                  setPin('')
                  setErro('')
                }}
                style={{ ...styles.link, padding: '4px 0' }}
              >
                não sou eu
              </button>
            </div>
          </div>

          <label style={styles.label} htmlFor="pin-rapido">
            O teu PIN
          </label>
          <input
            id="pin-rapido"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            autoFocus
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            style={{ ...styles.input, fontSize: 22, letterSpacing: 10, textAlign: 'center' }}
          />

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 14,
              fontSize: 14,
              minHeight: 44,
            }}
          >
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: colors.grass }}
            />
            <span>
              Lembrar-me neste telemóvel
              <span style={{ display: 'block', fontSize: 12, color: colors.muted }}>
                Para a próxima o link abre direto. O PIN não fica guardado.
              </span>
            </span>
          </label>

          {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}

          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            style={
              busy || pin.length !== 4
                ? disabled({ ...styles.button, marginTop: 16 })
                : { ...styles.button, marginTop: 16 }
            }
          >
            {busy ? 'A entrar…' : 'Entrar e votar'}
          </button>
        </form>
      )}
    </div>
  )
}
