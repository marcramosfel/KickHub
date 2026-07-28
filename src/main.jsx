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
