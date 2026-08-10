import { useMemo } from 'react'
import { diaLocal, fraseDoDia } from '../lib/frases'
import { colors, fonts } from '../theme'

// A provocação de boas-vindas.
//
// Uma frase por pessoa por dia, tirada dos números reais do grupo (ver
// `lib/frases.js`). É a única coisa da Home que não é accionável — está lá
// para dar vontade de mandar um print para o grupo.
//
// Discreta de propósito: uma linha, sem botão, sem cartão a competir com o
// estado da pelada logo por baixo. Se roubasse a atenção ao "há votação
// aberta", passava a ser um problema em vez de uma piada.

export default function FraseDoDia({ curiosidades, playerId }) {
  const frase = useMemo(
    () => fraseDoDia(curiosidades, playerId, diaLocal()),
    [curiosidades, playerId]
  )

  if (!frase) return null

  return (
    <div
      className="pb-pop"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '11px 14px',
        borderRadius: 12,
        border: `1px dashed ${colors.line}`,
        background: 'rgba(127,160,144,0.05)',
      }}
    >
      <span aria-hidden className="pb-float" style={{ fontSize: 18, lineHeight: 1.3 }}>
        {frase.icone}
      </span>
      <p
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: colors.muted,
          fontFamily: fonts.body,
        }}
      >
        {frase.texto}
      </p>
    </div>
  )
}
