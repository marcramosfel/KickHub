import { useMemo, useState } from 'react'
import { montarCampeonato } from '../lib/campeonato'
import { renderCampeonatoImagem } from '../lib/jogoImagem'
import BotaoPartilhar from './BotaoPartilhar'
import { colors, styles } from '../theme'

// O campeonatinho imaginário: quatro equipas equilibradas, todos contra todos
// e uma final. Vive dentro das Curiosidades porque é isso que é — uma
// curiosidade, não uma competição a sério.
//
// A lógica está em `lib/campeonato.js` e tem testes. Aqui é só desenho.

function Tabela({ tabela }) {
  return (
    <div className="pb-scroll-x">
      <table className="pb-camp-tab">
        <caption className="pb-cur-cap">Classificação</caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left' }}>
              Equipa
            </th>
            {['J', 'V', 'E', 'D', 'GM', 'GS', 'SG', 'PTS'].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabela.map((l, i) => (
            <tr key={l.id} className={i < 2 ? 'is-finalista' : undefined}>
              <th scope="row" style={{ textAlign: 'left' }}>
                <span aria-hidden style={{ color: l.cor, marginRight: 6 }}>
                  ●
                </span>
                {l.nome}
              </th>
              <td>{l.j}</td>
              <td>{l.v}</td>
              <td>{l.e}</td>
              <td>{l.d}</td>
              <td>{l.gm}</td>
              <td>{l.gs}</td>
              <td>{l.gm - l.gs > 0 ? `+${l.gm - l.gs}` : l.gm - l.gs}</td>
              <td style={{ fontWeight: 800 }}>{l.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...styles.mutedText, fontSize: 11, margin: '6px 0 0' }}>
        As duas primeiras vão à final. Vitória 3 pontos, empate 1.
      </p>
    </div>
  )
}

function Jogo({ jogo, destaque }) {
  return (
    <li className={`pb-camp-jogo${destaque ? ' is-final' : ''}`}>
      <span className="pb-truncate" style={{ textAlign: 'right' }}>
        {jogo.nomeA}
      </span>
      <strong>
        {jogo.golosA}–{jogo.golosB}
      </strong>
      <span className="pb-truncate">{jogo.nomeB}</span>
      {jogo.craque && (
        <span className="pb-camp-craque">
          <span aria-hidden>⭐</span> {jogo.craque.name}
        </span>
      )}
    </li>
  )
}

export default function Campeonato({ jogadores }) {
  const [tentativa, setTentativa] = useState(0)
  const c = useMemo(
    () => montarCampeonato({ jogadores, seed: `campeonato-${tentativa}` }),
    [jogadores, tentativa]
  )

  if (!c.completo) {
    return (
      <section className="pb-card">
        <h2 className="pb-cur-tit">
          <span aria-hidden>🏆</span> Campeonatinho da pelada
        </h2>
        <p style={{ ...styles.mutedText, fontSize: 13, margin: '6px 0 0' }}>{c.motivo}</p>
      </section>
    )
  }

  const premios = [
    ['⚽', 'Artilheiro', c.premios.artilheiro, 'gols'],
    ['🎯', 'Rei das assistências', c.premios.reiDasAssistencias, 'assist.'],
    ['👑', 'Melhor jogador', c.premios.melhorJogador, 'vezes craque'],
  ].filter(([, , p]) => p)

  return (
    <section className="pb-card pb-stack">
      <div>
        <h2 className="pb-cur-tit">
          <span aria-hidden>🏆</span> Campeonatinho da pelada
        </h2>
        <p style={{ ...styles.mutedText, fontSize: 12, margin: '4px 0 0' }}>
          Quatro equipas equilibradas, todos contra todos e uma final. Quem entra sai à sorte — um
          campeonato em que os mesmos ficam sempre de fora não seria do grupo.
        </p>
      </div>

      <div className="pb-camp-campeao" style={{ borderColor: c.campeao.cor }}>
        <span aria-hidden style={{ fontSize: 30 }}>
          🏆
        </span>
        <span>
          <span className="pb-cur-destaque-rot">Campeão</span>
          <strong style={{ display: 'block', fontSize: 20, color: c.campeao.cor }}>
            {c.campeao.nome}
          </strong>
          <span style={{ fontSize: 12, color: colors.muted }}>
            Final: {c.final.nomeA} {c.final.golosA}–{c.final.golosB} {c.final.nomeB}
            {c.campeaoPorClassificacao && ' · empate, decidido pela classificação'}
          </span>
        </span>
      </div>

      <Tabela tabela={c.tabela} />

      <div>
        <h3 className="pb-cur-cap" style={{ padding: 0, marginBottom: 6 }}>
          Jogos
        </h3>
        <ul className="pb-camp-jogos">
          {c.jogos.map((j) => (
            <Jogo key={j.rodada} jogo={j} />
          ))}
          <Jogo jogo={c.final} destaque />
        </ul>
      </div>

      {premios.length > 0 && (
        <div className="pb-cards-sm">
          {premios.map(([icone, rotulo, p, unidade]) => (
            <div key={rotulo} className="pb-cur-destaque">
              <span aria-hidden style={{ fontSize: 20 }}>
                {icone}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="pb-cur-destaque-rot">{rotulo}</span>
                <span className="pb-truncate" style={{ display: 'block', fontSize: 13 }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 11, color: colors.muted }}>
                  {p.total} {unidade}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ ...styles.mutedText, fontSize: 11, margin: 0 }}>
        Equilíbrio das equipas: {c.equilibrio.rotulo} ({c.equilibrio.pct.toFixed(1)}%)
        {c.deFora > 0 && ` · ${c.deFora} ficaram de fora desta edição`}
      </p>

      <BotaoPartilhar
        nome="campeonatinho"
        titulo="Pelada Browns — Campeonatinho"
        gerar={() => renderCampeonatoImagem({ campeonato: c })}
      />

      <button
        type="button"
        onClick={() => setTentativa((n) => n + 1)}
        className="pb-tap"
        style={{ ...styles.buttonGhost, fontSize: 13 }}
      >
        🎲 Outro campeonato
      </button>
    </section>
  )
}
