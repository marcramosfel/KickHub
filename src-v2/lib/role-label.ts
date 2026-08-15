import type { Pelada } from '../data/demo'
import type { Translate } from './i18n'

export function roleLabel(role: Pelada['role'], t: Translate) {
  if (role === 'owner') return t('dashboard.owner')
  if (role === 'admin') return t('dashboard.admin')
  return t('dashboard.player')
}
