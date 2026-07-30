import { adminApprove, adminReject } from '../../api'
import Avatar from '../Avatar'
import { colors, styles } from '../../theme'

// Quem pediu para entrar no grupo.
//
// Aprovar e rejeitar são as duas únicas ações, e a rejeição apaga a conta —
// daí a confirmação. O `onAcao` vem do painel: é ele que trata do "ocupado",
// dos erros e de recarregar tudo a seguir.

function idade(dob) {
  if (!dob) return null
  const d = new Date(dob)
  const hoje = new Date()
  let anos = hoje.getFullYear() - d.getFullYear()
  const m = hoje.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--
  return anos
}

export default function PedidosPanel({ pw, pedidos = [], busy, onAcao }) {
  const aprovar = (p) => onAcao(() => adminApprove(pw, p.id))

  const rejeitar = (p) => {
    if (!window.confirm(`Rejeitar ${p.name}? Esta ação apaga a conta e os votos.`)) return
    onAcao(() => adminReject(pw, p.id))
  }

  if (pedidos.length === 0) {
    return (
      <div className="pb-card" style={{ textAlign: 'center', padding: 22 }}>
        <p style={styles.mutedText}>Sem pedidos pendentes. 👌</p>
      </div>
    )
  }

  return (
    <div className="pb-cards">
      {pedidos.map((p) => (
        <div key={p.id} className="pb-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Avatar name={p.name} photo={p.photo_url} size={48} />
            <div style={{ minWidth: 0 }}>
              <div className="pb-truncate" style={{ fontWeight: 700, fontSize: 16 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 13, color: colors.muted }}>
                {idade(p.dob) != null ? `${idade(p.dob)} anos` : 'Idade desconhecida'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => aprovar(p)}
              disabled={busy}
              style={{ ...styles.button, padding: '10px 0', fontSize: 14, minHeight: 44 }}
            >
              Aprovar
            </button>
            <button
              onClick={() => rejeitar(p)}
              disabled={busy}
              style={{
                ...styles.buttonGhost,
                padding: '10px 0',
                fontSize: 14,
                minHeight: 44,
                color: colors.error,
                borderColor: colors.error,
              }}
            >
              Rejeitar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
