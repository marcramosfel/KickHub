// Tema "placar noturno / campo"
export const colors = {
  bg: '#0A1512', // fundo verde-quase-preto
  panel: '#10201A', // painéis
  line: '#1E3A2E', // linhas / bordas
  text: '#EAF2EC', // texto principal
  muted: '#7FA090', // tom secundário
  grass: '#34D058', // destaque (relva)
  teamA: '#FFC531', // Amarelos
  teamB: '#35A7FF', // Azuis
  error: '#FF5A5A',
}

export const fonts = {
  title: "'Oswald', 'Inter', sans-serif",
  body: "'Inter', system-ui, sans-serif",
}

export const styles = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '20px 16px 40px',
    minHeight: '100vh',
    fontFamily: fonts.body,
    color: colors.text,
  },
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.line}`,
    borderRadius: 16,
    padding: 16,
  },
  title: {
    fontFamily: fonts.title,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: 600,
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
    fontWeight: 500,
  },
  input: {
    width: '100%',
    background: '#0C1915',
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 16,
    color: colors.text,
    outline: 'none',
  },
  button: {
    width: '100%',
    background: colors.grass,
    color: '#06130D',
    border: 'none',
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: 16,
    fontWeight: 700,
    fontFamily: fonts.title,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buttonGhost: {
    width: '100%',
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.line}`,
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 600,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginTop: 10,
  },
  mutedText: {
    color: colors.muted,
    fontSize: 14,
  },
}

// Um botão desativado fica esbatido
export const disabled = (base) => ({ ...base, opacity: 0.4, cursor: 'not-allowed' })
