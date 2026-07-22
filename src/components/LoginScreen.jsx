import { useState } from 'react'
import { login, register } from '../api'
import { fileToDataURL } from '../lib/image'
import { ADMIN_NAME, APP_NAME, APP_TAGLINE } from '../config'
import { colors, fonts, styles, disabled } from '../theme'

function Header() {
  return (
    <div style={{ textAlign: 'center', margin: '24px 0 28px' }}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>⚖️</div>
      <h1 style={{ ...styles.title, fontSize: 30, lineHeight: 1.1 }}>
        {APP_NAME.main} <span style={{ color: colors.grass }}>{APP_NAME.accent}</span>
      </h1>
      <p style={{ ...styles.mutedText, marginTop: 6 }}>{APP_TAGLINE}</p>
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
  const [newUserId, setNewUserId] = useState('') // ID gerado no registo
  const [copied, setCopied] = useState(false)

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(newUserId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard indisponível — o ID fica visível na mesma */
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !/^\d{4}$/.test(pin)) {
      setError('Preenche o nome (ou ID) e o PIN de 4 dígitos.')
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
      const uid = await register(regName.trim(), regDob, photo, regPin)
      setNewUserId(uid || '')
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
            Aguarda a aprovação do admin. Depois de aprovado, entras com o teu nome ou com o teu
            ID e o PIN.
          </p>

          {newUserId && (
            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 12,
                background: '#0C1915',
                border: `1px solid ${colors.line}`,
              }}
            >
              <div style={{ ...styles.label, marginBottom: 8 }}>O teu ID de entrada</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <code
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 18,
                    fontWeight: 700,
                    color: colors.grass,
                    letterSpacing: 0.5,
                    wordBreak: 'break-all',
                  }}
                >
                  {newUserId}
                </code>
                <button
                  type="button"
                  onClick={copyId}
                  aria-label="Copiar ID"
                  style={{
                    ...styles.buttonGhost,
                    width: 'auto',
                    padding: '8px 12px',
                    fontSize: 13,
                    color: copied ? colors.grass : colors.text,
                    borderColor: copied ? colors.grass : colors.line,
                    flexShrink: 0,
                  }}
                >
                  {copied ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
                Guarda-o: serve para entrar mesmo que alguém tenha um nome parecido.
              </p>
            </div>
          )}

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
            <label style={styles.label}>Nome ou ID de utilizador</label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="O teu nome ou o teu ID"
              autoComplete="off"
            />
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 6 }}>
              Podes usar o teu nome ou o ID único (ex.: <code>marcosfelipe</code>).
            </p>
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
        <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 14 }}>
          ⚽ Organizado por {ADMIN_NAME}
        </p>
      </div>
    </div>
  )
}
