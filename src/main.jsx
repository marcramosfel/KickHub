import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
// A camada responsiva (grelha de 12 colunas, navegação, safe areas). Os
// estilos inline não fazem media queries — é aqui que isso vive.
import './styles/layout.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// ---------- instalar no telemóvel ----------
//
// Regista o service worker que guarda a casca da app (ver `public/sw.js` —
// só a casca, nunca os dados). É o que faz a app abrir do ecrã inicial sem
// passar pelo browser.
//
// Só em produção: em desenvolvimento um SW a servir de cache faz o vite
// parecer avariado, a mostrar código antigo depois de cada gravação.
//
// Depois do `load` de propósito: registar durante o arranque compete com o
// que a app precisa mesmo para pintar o primeiro ecrã.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem service worker a app funciona na mesma — só não abre offline.
    })
  })
}
