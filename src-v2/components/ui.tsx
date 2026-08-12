import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'outline'; size?: 'sm' | 'md' | 'lg' | 'icon' }) {
  return <button className={cn('btn', `btn-${variant}`, `btn-${size}`, className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'lime' | 'blue' | 'orange' }) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('')
  return <span className={cn('avatar', `avatar-${size}`)} aria-label={name}>{initials}</span>
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <Card className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{body}</p>{action}</Card>
}
