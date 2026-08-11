import { useEffect, useState } from 'react'
import { getForecastAccuracy } from '../api'
import { colors, styles } from '../theme'

// Quantas vezes a previsão da pelada acertou.
//
// O número vem derivado da base (`forecast_accuracy()`): lê as previsões e os
// placares finais e conta. Não há coluna de "acertou" em lado nenhum — um
// resultado corrigido pelo admin corrige este número sozinho.
//
// Não aparece enquanto não houver jogos julgados. Um "0 de 0 (0%)" não diz
// nada a ninguém, e a regra da casa é que uma categoria sem dados não sai.

export default function AcertosDaPrevisao() {
  const [dados, setDados] = useState(null)

  useEffect(() => {
    let vivo = true
    // Falhar aqui é não mostrar a secção. Sem a migração aplicada a função
    // ainda não existe, e isso não pode partir o ecrã inteiro.
    getForecastAccuracy()
      .then((r) => vivo && setDados(r))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  const total = Number(dados?.total ?? 0)
  if (!total) return null

  const acertos = Number(dados?.acertos ?? 0)
  const pct = Math.round((acertos / total) * 100)

  return (
    <section className="pb-card" aria-label="Acertos da previsão">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span aria-hidden style={{ fontSize: 30 }}>
          🤖
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="pb-cur-destaque-rot">A previsão da pelada</span>
          <p style={{ margin: '2px 0 0', fontSize: 15 }}>
            Acertou o vencedor em{' '}
            <strong style={{ color: pct >= 50 ? colors.grass : colors.teamA }}>
              {acertos} de {total}
            </strong>{' '}
            {total === 1 ? 'jogo' : 'jogos'} — {pct}%.
          </p>
        </div>
      </div>
      <p style={{ ...styles.mutedText, fontSize: 11, margin: '8px 0 0' }}>
        Conta o vencedor, não o placar exato: num jogo que acaba 14×12, acertar o placar seria
        sorte e não previsão.
      </p>
    </section>
  )
}
