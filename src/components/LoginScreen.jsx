import { useState } from 'react'
import { login, register } from '../api'
import { fileToDataURL } from '../lib/image'
import { colors, fonts, styles, disabled } from '../theme'

function Header() {
  return (
    <div style={{ textAlign: 'center', margin: '24px 0 28px' }}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>⚖️</div>
      <h1 style={{ ...styles.title, fontSize: 30, lineHeight: 1.1 }}>
        Pelada <span style={{ color: colors.grass }}>Equilibrada</span>
      </h1>
      <p style={{ ...styles.mutedText, marginTop: 6 }}>
        Times justos, sorteados pela nota do grupo.
      </p>
    </div>
  )
}

function Tabs({ mode, setMode }) {
  const tab = (id, label) => (
    <button
      onClick={() => setMode(id)}
      style={{
        flex: 1,
        padding: '10px 0',
        background: mode === id ? colors.panel : 'transparent',
        color: mode === id ? colors.text : colors.muted,
        border: 'none',
        borderBottom: `2px solid ${mode === id ? colors.grass : colors.line}`,
        fontFamily: fonts.title,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', marginBottom: 18 }}>
      {tab('login', 'Entrar')}
      {tab('register', 'Registar')}
    </div>
  )
}

export default function LoginScreen({ onLogin, onAdmin }) {
  const [mode, setMode] = useState('login') // login | register | sent

  // login
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')

  // registo
  const [regName, setRegName] = useState('')
  const [regDob, setRegDob] = useState('')
  const [regPin, setRegPin] = useState('')
  const [photo, setPhoto] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !/^\d{4}$/.test(pin)) {
      setError('Preenche o nome e o PIN de 4 dígitos.')
      return
    }
    setBusy(true)
    try {
      const s = await login(name.trim(), pin)
      onLogin({ ...s, pin })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      setPhoto(await fileToDataURL(file))
    } catch (err) {
      setPhoto('')
      setError(err.message)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (!regName.trim()) return setError('O nome é obrigatório.')
    if (!regDob) return setError('A data de nascimento é obrigatória.')
    if (!photo) return setError('A foto é obrigatória.')
    if (!/^\d{4}$/.test(regPin)) return setError('O PIN tem de ter exatamente 4 dígitos.')
    setBusy(true)
    try {
      await register(regName.trim(), regDob, photo, regPin)
      setMode('sent')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'sent') {
    return (
      <div style={styles.page}>
        <Header />
        <div style={{ ...styles.panel, textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
          <h2 style={{ ...styles.title, fontSize: 20, marginBottom: 10 }}>Registo enviado</h2>
          <p style={styles.mutedText}>
            Aguarda a aprovação do admin. Depois de aprovado, já podes entrar com o teu nome e
            PIN.
          </p>
          <button
            style={{ ...styles.buttonGhost, marginTop: 20 }}
            onClick={() => switchMode('login')}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <Header />
      <Tabs mode={mode} setMode={switchMode} />

      {mode === 'login' && (
        <form onSubmit={handleLogin} style={styles.panel}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Nome</label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="O teu nome na pelada"
              autoComplete="off"
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={styles.label}>PIN (4 dígitos)</label>
            <input
              style={styles.input}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              type="password"
              inputMode="numeric"
              placeholder="••••"
              autoComplete="off"
            />
          </div>
          <button type="submit" style={busy ? disabled(styles.button) : styles.button} disabled={busy}>
            {busy ? 'A entrar…' : 'Entrar'}
          </button>
          {error && <p style={styles.errorText}>{error}</p>}
        </form>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} style={styles.panel}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Nome *</label>
            <input
              style={styles.input}
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="Como te chamam na pelada"
              autoComplete="off"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Data de nascimento *</label>
            <input
              style={styles.input}
              value={regDob}
              onChange={(e) => setRegDob(e.target.value)}
              type="date"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Foto *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {photo ? (
                <img
                  src={photo}
                  alt="Pré-visualização"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `2px solid ${colors.grass}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: `2px dashed ${colors.line}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.muted,
                    fontSize: 22,
                  }}
                >
                  📷
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhoto}
                style={{ color: colors.muted, fontSize: 14, flex: 1, minWidth: 0 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={styles.label}>Escolhe um PIN (4 dígitos) *</label>
            <input
              style={styles.input}
              value={regPin}
              onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              type="password"
              inputMode="numeric"
              placeholder="••••"
              autoComplete="off"
            />
          </div>
          <button type="submit" style={busy ? disabled(styles.button) : styles.button} disabled={busy}>
            {busy ? 'A enviar…' : 'Enviar registo'}
          </button>
          {error && <p style={styles.errorText}>{error}</p>}
          <p style={{ ...styles.mutedText, marginTop: 12, fontSize: 13 }}>
            A conta fica pendente até o admin aprovar.
          </p>
        </form>
      )}

      <div style={{ textAlign: 'center', marginTop: 26 }}>
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
    </div>
  )
}
