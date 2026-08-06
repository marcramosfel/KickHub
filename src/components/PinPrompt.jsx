import { useState } from 'react'
import { login } from '../api'
import { ErrorBox } from './Ui'
import { fonts, styles, disabled } from '../theme'

// Pedir o PIN a meio da sessão.
//
// Quem entrou pelo "lembrar-me neste telemóvel" tem uma sessão sem PIN: o
// que fica guardado é um token do servidor, que autoriza LER e VOTAR e mais
// nada. É uma escolha de segurança — um telemóvel emprestado fica em "votou
// por ti", não em "mudou-te a conta".
//
// Só que trocar a foto, mudar o PIN, escolher o card ou gravar as posições
// continuam a exigir o PIN, e sem este ecrã essas ações falhavam com "Nome
// ou PIN incorretos" — uma mensagem que não diz nada a quem nunca escreveu
// nenhum PIN. Agora pede-se uma vez e a sessão passa a tê-lo em memória
// (só em memória, como sempre).

export default function PinPrompt({ nome, motivo, onConfirmar, onCancelar }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const confirmar = async (e) => {
    e.preventDefault()
    if (pin.length !== 4 || busy) return
    setErro('')
    setBusy(true)
    try {
      // `login` é a forma mais barata de validar o PIN sem inventar uma RPC
      // só para isso. A sessão que devolve é ignorada de propósito: trocá-la
      // a meio traria de volta avisos já lidos e outras surpresas — aqui só
      // se quer saber se o PIN está certo.
      await login(nome, pin)
      onConfirmar(pin)
    } catch (err) {
      setErro(err.message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar o PIN"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(6, 19, 13, 0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar()
      }}
    >
      <form
        onSubmit={confirmar}
        className="pb-card"
        style={{ width: '100%', maxWidth: 380 }}
      >
        <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 17, marginBottom: 6 }}>
          🔑 Confirma o teu PIN
        </div>
        <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 14 }}>
          {motivo || 'Esta ação precisa do teu PIN.'} Entraste neste telemóvel sem o escrever — é
          só desta vez.
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={4}
          autoFocus
          aria-label="PIN de 4 dígitos"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          style={{ ...styles.input, fontSize: 22, letterSpacing: 10, textAlign: 'center' }}
        />

        {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancelar}
            style={{ ...styles.buttonGhost, flex: '1 1 110px', width: 'auto' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            style={
              busy || pin.length !== 4
                ? disabled({ ...styles.button, flex: '2 1 150px', width: 'auto' })
                : { ...styles.button, flex: '2 1 150px', width: 'auto' }
            }
          >
            {busy ? 'A confirmar…' : 'Confirmar'}
          </button>
        </div>

        <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 12, textAlign: 'center' }}>
          O PIN fica só em memória, nunca é guardado no telemóvel.
        </p>
      </form>
    </div>
  )
}
