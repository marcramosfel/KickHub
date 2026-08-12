import { Goal } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() { return <main className="not-found"><Goal/><span className="eyebrow dark-text">404 · BOLA FORA</span><h1>Esta página saiu pela linha lateral.</h1><p>Volta ao campo e continua o jogo.</p><Link className="btn btn-primary btn-lg" to="/app">Ir para o início</Link></main> }
