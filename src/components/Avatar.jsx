import { colors, fonts } from '../theme'

// Foto do jogador ou, sem foto, as iniciais.
export default function Avatar({ name, photo, size = 44 }) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `2px solid ${colors.line}`,
    flexShrink: 0,
  }

  if (photo) {
    return <img src={photo} alt={name} style={{ ...style, objectFit: 'cover' }} />
  }

  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div
      style={{
        ...style,
        background: '#16261F',
        color: colors.muted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: fonts.title,
        fontWeight: 600,
        fontSize: size * 0.36,
        letterSpacing: 1,
      }}
    >
      {initials}
    </div>
  )
}
