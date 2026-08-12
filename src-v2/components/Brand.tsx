import { Link } from 'react-router-dom'

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link to="/" className="brand" data-inverse={inverse} aria-label="KickHub — início">
      <span className="brand-mark" aria-hidden="true"><i>K</i></span>
      <span>Kick<span>Hub</span></span>
    </Link>
  )
}
