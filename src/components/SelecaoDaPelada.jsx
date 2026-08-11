import { useMemo, useState } from 'react'
import { selecoesDaPelada } from '../lib/selecao'
import SelecaoPoster from './SelecaoPoster'
import { styles } from '../theme'

// A seleção da pelada — e a anti-seleção.
//
// Não decide nada: é uma brincadeira que dá conversa. O ranking já diz quem é
// o melhor, mas ninguém discute uma tabela; um onze montado põe toda a gente
// a explicar porque é que devia lá estar.
//
// A lógica (um por posição, sem overalls provisórios) vive em `lib/selecao.js`
// e tem testes. Aqui é só desenho, e o desenho está no `SelecaoPoster`.

export default function SelecaoDaPelada({ jogadores, onAbrirJogador }) {
  // A anti-seleção começa fechada. É uma piada, mas é uma piada sobre pessoas
  // reais — quem a quiser ver, abre-a.
  const [verPior, setVerPior] = useState(false)
  const { melhor, pior } = useMemo(() => selecoesDaPelada({ jogadores }), [jogadores])

  const temporada = useMemo(() => `Temporada ${new Date().getFullYear()}`, [])

  return (
    <div className="pb-stack">
      <SelecaoPoster
        selecao={melhor}
        titulo="Seleção da Pelada"
        subtitulo={temporada}
        onAbrirJogador={onAbrirJogador}
      />

      <p style={{ ...styles.mutedText, fontSize: 12, textAlign: 'center', margin: 0 }}>
        O melhor de cada posição, hoje. Um jogador por lugar, pelo overall de cada um — muda
        quando os números mudarem. Não decide nada e não é o sorteio.
      </p>

      {!verPior ? (
        <button
          type="button"
          onClick={() => setVerPior(true)}
          className="pb-tap"
          style={{ ...styles.buttonGhost, fontSize: 13 }}
        >
          😬 E o outro onze? Ver a anti-seleção
        </button>
      ) : (
        <>
          {/* Sem coroa: o "craque" da anti-seleção não é piada nenhuma para
              quem lá está. */}
          <SelecaoPoster
            selecao={pior}
            titulo="A Anti-Seleção"
            subtitulo="Sem ofensa"
            onAbrirJogador={onAbrirJogador}
            destacarCraque={false}
          />
          <p style={{ ...styles.mutedText, fontSize: 12, textAlign: 'center', margin: 0 }}>
            É o mesmo cálculo, ao contrário. Quem ainda não tem overall a sério fica de fora — não
            se entra na anti-seleção por ter chegado há duas semanas.
          </p>
        </>
      )}
    </div>
  )
}
