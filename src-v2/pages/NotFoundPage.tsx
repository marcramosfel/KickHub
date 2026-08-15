import { Goal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return <main className="not-found"><Goal/><span className="eyebrow dark-text">{t('common.notFoundEyebrow')}</span><h1>{t('common.notFoundTitle')}</h1><p>{t('common.notFoundBody')}</p><Link className="btn btn-primary btn-lg" to="/app">{t('common.goHome')}</Link></main>
}
