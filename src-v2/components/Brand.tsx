import { Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'

export function Brand({ inverse = false, ariaLabel = 'KickHub — início' }: { inverse?: boolean; ariaLabel?: string }) {
  return (
    <Link to="/" className="brand" data-inverse={inverse} aria-label={ariaLabel}>
      {/* A chapa é sempre escura, esteja a barra clara ou escura: é ela que
          garante o contraste do lima, que sobre branco desaparece. */}
      <span className="brand-mark" aria-hidden="true"><BrandMark size={22} tone="brand"/></span>
      <span>Kick<span>Hub</span></span>
    </Link>
  )
}
