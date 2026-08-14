import { Link } from 'react-router-dom'

export function Brand({ inverse = false, ariaLabel = 'KickHub — início' }: { inverse?: boolean; ariaLabel?: string }) {
  return (
    <Link to="/" className="brand" data-inverse={inverse} aria-label={ariaLabel}>
      <span className="brand-mark" aria-hidden="true"><i>K</i></span>
      <span>Kick<span>Hub</span></span>
    </Link>
  )
}
