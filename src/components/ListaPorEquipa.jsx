import { colors } from '../theme'

// Marcadores (ou assistências) de um jogo, SEPARADOS POR EQUIPA.
//
// Existe porque a primeira versão juntava os dois lados numa lista só:
// "Gols: Fafá (3), Félix (2), Emanuel, Erick, Dudu (5), Emerson (2)". Está lá
// tudo e não se percebe nada — num 7×8 ninguém consegue dizer quem marcou por
// quem, que é exatamente a pergunta que se faz ao ler um placar.
//
// Usada pelas Curiosidades e pelo Simulador, para as duas contarem o jogo da
// mesma maneira.

function Lado({ nome, itens, cor }) {
  if (!itens?.length) return null
  return (
    <span style={{ display: 'inline' }}>
      <span style={{ color: cor, fontWeight: 600 }}>{nome}:</span>{' '}
      {itens.map((x, i) => (
        <span key={x.id}>
          {i > 0 && ', '}
          {x.name}
          {x.total > 1 && ` (${x.total})`}
        </span>
      ))}
    </span>
  )
}

export default function ListaPorEquipa({ titulo, icone, a, b, nomeA, nomeB }) {
  if (!a?.length && !b?.length) return null
  return (
    <p style={{ fontSize: 13, margin: '0 0 6px', lineHeight: 1.5 }}>
      <span aria-hidden style={{ marginRight: 6 }}>
        {icone}
      </span>
      <span style={{ color: colors.muted }}>{titulo} — </span>
      <Lado nome={nomeA} itens={a} cor={colors.teamA} />
      {a?.length > 0 && b?.length > 0 && (
        <span aria-hidden style={{ color: colors.muted }}>
          {' · '}
        </span>
      )}
      <Lado nome={nomeB} itens={b} cor={colors.teamB} />
    </p>
  )
}
