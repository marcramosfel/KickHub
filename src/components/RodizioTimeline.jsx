import { useMemo } from 'react'
import { nomeDaEquipa, corDaEquipa } from '../lib/substitutions'
import Avatar from './Avatar'
import { colors, fonts, styles } from '../theme'

// A ordem do rodízio de goleiro, por equipa.
//
// Sem isto, um jogo "sem goleiros fixos" chegava ao jogador como uma lista
// de nomes igual à de sempre — nada dizia quem ia começar na baliza, que é
// exatamente a primeira coisa que ele quer saber ao abrir o sorteio.
//
// Mostra-se como linha do tempo e não como lista: a informação é uma
// SEQUÊNCIA (quem começa, quem entra a seguir), e uma lista não diz isso.

// A que minuto entra cada um. Sem `minutos` definidos não se inventa um
// horário — mostra-se só a ordem, que é o que se sabe.
function minutoDe(indice, minutos) {
  if (!minutos) return null
  return indice * minutos
}

function Linha({ jogador, indice, minutos, cor, souEu }) {
  const inicio = minutoDe(indice, minutos)
  const fim = minutos == null ? null : inicio + minutos
  const primeiro = indice === 0

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        borderTop: indice === 0 ? 'none' : `1px solid ${colors.line}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26,
          flexShrink: 0,
          textAlign: 'center',
          fontSize: primeiro ? 16 : 12,
          color: primeiro ? colors.teamA : colors.muted,
          fontFamily: fonts.title,
        }}
      >
        {primeiro ? '🧤' : indice + 1}
      </span>
      <Avatar name={jogador.name} photo={jogador.photo} size={30} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          className="pb-truncate"
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: primeiro ? 700 : 500,
            color: primeiro ? colors.text : colors.muted,
          }}
        >
          {jogador.name}
          {souEu && <span style={{ color: cor, fontWeight: 700 }}> · tu</span>}
        </span>
        {primeiro && (
          <span style={{ fontSize: 11, color: colors.teamA, letterSpacing: 0.5 }}>
            INICIA NO GOL
          </span>
        )}
      </span>
      {inicio != null && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 12,
            color: colors.muted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {inicio}&#39;–{fim}&#39;
        </span>
      )}
    </li>
  )
}

export default function RodizioTimeline({ jogo, meuId, compacto = false }) {
  const minutos = jogo?.gk_rotation_minutes || null

  const equipas = useMemo(() => {
    if (jogo?.gk_mode !== 'ROTATING') return []
    return ['A', 'B']
      .map((lado) => ({
        lado,
        fila: (jogo.lineup || [])
          .filter((l) => l.team === lado && l.gk_order != null)
          .sort((a, b) => a.gk_order - b.gk_order)
          .map((l) => ({ id: l.player_id, name: l.name, photo: l.photo })),
      }))
      .filter((e) => e.fila.length > 0)
  }, [jogo])

  if (!equipas.length) return null

  // O destaque pessoal é o que transforma isto de "informação" em "aviso":
  // ninguém lê a ordem toda à procura do próprio nome.
  const minhaVez = equipas
    .map((e) => ({ lado: e.lado, i: e.fila.findIndex((j) => j.id === meuId) }))
    .find((x) => x.i >= 0)

  return (
    <div className="pb-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
          🔄 Rodízio de goleiro
        </div>
        {minutos && (
          <span style={{ fontSize: 12, color: colors.muted }}>troca a cada {minutos} min</span>
        )}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
        Ninguém é goleiro fixo: toda a gente joga na linha e a baliza roda.
      </p>

      {minhaVez && (
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: colors.teamA,
            background: 'rgba(255,197,49,0.10)',
            border: `1px solid ${colors.teamA}55`,
            borderRadius: 10,
            padding: '9px 12px',
            marginBottom: 12,
          }}
          role="status"
        >
          {minhaVez.i === 0
            ? '🧤 Começas no gol!'
            : minutos
              ? `🔄 Vais ao gol aos ${minutoDe(minhaVez.i, minutos)}'.`
              : `🔄 És o ${minhaVez.i + 1}.º a ir ao gol.`}
        </p>
      )}

      <div className={compacto ? 'pb-stack' : 'pb-cards'} style={{ gap: 14 }}>
        {equipas.map(({ lado, fila }) => (
          <div key={lado}>
            <div
              style={{
                fontSize: 12,
                color: corDaEquipa(lado),
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {nomeDaEquipa(lado)}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {fila.map((j, i) => (
                <Linha
                  key={j.id}
                  jogador={j}
                  indice={i}
                  minutos={minutos}
                  cor={corDaEquipa(lado)}
                  souEu={j.id === meuId}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
