import { useEffect, useMemo, useState } from 'react'
import { juntarResenha } from '../../lib/resenha'
import { colors, fonts, styles } from '../../theme'

// Editor da resenha antes de publicar.
//
// O gerador dá um rascunho bom; a palavra final é do admin: cada frase pode
// entrar ou ficar de fora, o conjunto pode ser regenerado (muda a semente) e
// o texto final é editável à mão. O que sair daqui vai como corpo do post.
//
// `gerar(tentativa)` → [{categoria, texto}] vem de fora: este componente não
// sabe se a resenha é de sorteio ou de resultado, só a edita.

const NOME_CATEGORIA = {
  equilibrio_bom: 'Análise do sorteio',
  equilibrio_mau: 'Análise do sorteio',
  duelo_artilheiro_paredao: 'Duelo',
  titulo_no_time: 'Títulos em campo',
  boa_fase: 'Boa fase',
  pressionado: 'Pressionado',
  goleiro_seguro: 'Goleiro',
  invicto_em_risco: 'Invencibilidade',
  pre_jogo_generico: 'Pré-jogo',
  pos_placar: 'Resultado',
  pos_empate: 'Resultado',
  pos_zebra: 'Zebra da rodada',
  quebra_sequencia: 'Quebra de sequência',
  pos_artilheiro_dia: 'Artilheiro do dia',
  pos_garcom: 'Garçom',
  pos_paredao: 'Paredão',
}

// `inicial` restaura o texto quando o editor remonta (voltar ao passo 6 do
// assistente e regressar ao 7 desmonta-o) — sem isto, a edição do admin era
// substituída em silêncio pelo rascunho regenerado.
export default function ResenhaEditor({ gerar, onChange, inicial = '' }) {
  const [tentativa, setTentativa] = useState(0)
  // A seleção guarda o TEXTO das frases desmarcadas, não o índice: quando os
  // dados do formulário mudam por baixo (placar corrigido, mais um gol), a
  // lista recompõe-se e os índices deslizam — a frase desmarcada continuaria
  // desmarcada só por acaso. Guardar por conteúdo sobrevive à recomposição,
  // e uma frase nova entra sempre ativa, à vista.
  const [desmarcadas, setDesmarcadas] = useState(() => new Set())
  const [manual, setManual] = useState(() => (inicial ? inicial : null))

  const frases = useMemo(() => {
    try {
      return gerar?.(tentativa) || []
    } catch {
      return [] // resenha nunca pode impedir uma publicação
    }
  }, [gerar, tentativa])

  const escolhidas = useMemo(
    () => frases.filter((f) => !desmarcadas.has(f.texto)),
    [frases, desmarcadas]
  )

  const texto = manual != null ? manual : juntarResenha(escolhidas)

  // o pai recebe sempre o texto final (é o que vai no publish)
  useEffect(() => {
    onChange?.(texto)
  }, [texto, onChange])

  const alternar = (f) => {
    setManual(null)
    setDesmarcadas((prev) => {
      const next = new Set(prev)
      if (next.has(f.texto)) next.delete(f.texto)
      else next.add(f.texto)
      return next
    })
  }

  const regenerar = () => {
    setManual(null)
    setDesmarcadas(new Set())
    setTentativa((t) => t + 1)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
          📝 Resenha da publicação
        </span>
        <span style={{ ...styles.mutedText, fontSize: 12 }}>
          gerada com os dados reais — corta, edita ou gera outra
        </span>
      </div>

      {frases.length === 0 ? (
        <p style={{ ...styles.mutedText, fontSize: 13 }}>
          Sem dados suficientes para uma resenha — a publicação sai sem texto (podes escrever um).
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {frases.map((f, i) => {
            const incluida = !desmarcadas.has(f.texto)
            return (
              <li key={`${tentativa}-${i}`}>
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    padding: '7px 9px',
                    borderRadius: 10,
                    border: `1px solid ${incluida ? colors.line : 'transparent'}`,
                    background: incluida ? '#0C1915' : 'transparent',
                    opacity: incluida ? 1 : 0.5,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={incluida}
                    onChange={() => alternar(f)}
                    style={{ width: 16, height: 16, accentColor: colors.grass, flexShrink: 0, marginTop: 2 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', display: 'block' }}>
                      {NOME_CATEGORIA[f.categoria] || f.categoria}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 1.45 }}>{f.texto}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          onClick={regenerar}
          style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px', fontSize: 13 }}
        >
          🎲 Gerar outra
        </button>
      </div>

      <label style={styles.label} htmlFor="resenha-final">
        Texto final (editável)
      </label>
      <textarea
        id="resenha-final"
        rows={Math.max(2, texto.split('\n').length)}
        style={{ ...styles.input, resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
        value={texto}
        onChange={(e) => setManual(e.target.value)}
        placeholder="A publicação sai sem resenha se isto ficar vazio."
      />
    </div>
  )
}
