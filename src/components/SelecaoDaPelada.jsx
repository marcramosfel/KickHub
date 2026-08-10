import { useMemo, useState } from 'react'
import { selecoesDaPelada } from '../lib/selecao'
import { nomeDaPosicao } from '../lib/positions'
import Avatar from './Avatar'
import FootballPitch from './FootballPitch'
import { colors, fonts, styles } from '../theme'

// A seleção da pelada — e a anti-seleção.
//
// Não decide nada: é uma brincadeira que dá conversa. O ranking já diz quem é
// o melhor, mas ninguém discute uma tabela; um onze montado põe toda a gente
// a explicar porque é que devia lá estar.
//
// A lógica (um por posição, sem overalls provisórios) vive em `lib/selecao.js`
// e tem testes. Aqui é só desenho.

function Onze({ s, cor, titulo, subtitulo, icone }) {
  // O campo quer o formato da escalação de um jogo a sério.
  const lineup = useMemo(
    () =>
      s.lineup.map((j) => ({
        player_id: j.id,
        name: j.name,
        photo: j.photo,
        team: 'A',
        assigned_position: j.slot,
        is_goalkeeper: j.slot === 'GK',
        overall_at_draw: j.slot === 'GK' ? (j.gkOverall ?? j.overall) : j.overall,
      })),
    [s.lineup]
  )

  return (
    <div className="pb-card" style={{ borderColor: cor }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ fontSize: 18 }}>
          {icone}
        </span>
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, color: cor }}>
          {titulo}
        </span>
        {s.media != null && (
          <span style={{ ...styles.mutedText, fontSize: 12, marginLeft: 'auto' }}>
            média {s.media} · {s.formacao}
          </span>
        )}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, margin: '6px 0 12px' }}>{subtitulo}</p>

      {!s.completa && (
        <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
          ⚠️ Ainda não há gente com overall calculado para todos os lugares — este onze está
          incompleto.
        </p>
      )}

      {s.lineup.length > 0 ? (
        <>
          <FootballPitch lineup={lineup} showOverall />
          <ul
            className="pb-stagger"
            style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}
          >
            {s.lineup.map((j) => (
              <li
                key={j.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 0',
                  borderBottom: `1px solid ${colors.line}`,
                }}
              >
                <Avatar name={j.name} photo={j.photo} size={26} />
                <span className="pb-truncate" style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  {j.name}
                </span>
                <span style={{ fontSize: 11, color: colors.muted, flexShrink: 0 }}>
                  {nomeDaPosicao(j.slot)}
                </span>
                <span
                  style={{
                    fontFamily: fonts.title,
                    fontSize: 15,
                    fontWeight: 700,
                    color: cor,
                    width: 32,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {j.slot === 'GK' ? (j.gkOverall ?? j.overall) : j.overall}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={styles.mutedText}>Ainda não há jogadores com overall calculado.</p>
      )}
    </div>
  )
}

export default function SelecaoDaPelada({ jogadores }) {
  // A anti-seleção começa fechada. É uma piada, mas é uma piada sobre pessoas
  // reais — quem a quiser ver, abre-a.
  const [verPior, setVerPior] = useState(false)
  const { melhor, pior } = useMemo(() => selecoesDaPelada({ jogadores }), [jogadores])

  return (
    <div className="pb-stack">
      <p style={{ ...styles.mutedText, fontSize: 13 }}>
        O melhor onze possível da pelada, um jogador por posição, pelo overall de cada um. Não
        decide nada e não é o sorteio — é só para discutir.
      </p>

      <Onze
        s={melhor}
        cor={colors.teamA}
        icone="🏆"
        titulo="A SELEÇÃO DA PELADA"
        subtitulo="O melhor de cada posição, hoje. Muda quando os números mudarem."
      />

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
        <Onze
          s={pior}
          cor={colors.teamB}
          icone="🫣"
          titulo="A ANTI-SELEÇÃO"
          subtitulo="Sem ofensa: é o mesmo cálculo, ao contrário. Quem ainda não tem overall a sério fica de fora."
        />
      )}
    </div>
  )
}
