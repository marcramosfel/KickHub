import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui'

export function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem('kickhub-theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setDark((value) => {
        localStorage.setItem('kickhub-theme', value ? 'light' : 'dark')
        return !value
      })}
      aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </Button>
  )
}
