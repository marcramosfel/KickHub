import { useMemo, useState } from 'react'
import { destaquesDoDuelo, dueloDosPerebas, melhorJogoPossivel, numerosDoDuelo } from '../lib/curiosidades'
import { nomeDaPosicao } from '../lib/positions'
import Avatar from './Avatar'
import Campeonato from './Campeonato'
import FootballPitch from './FootballPitch'
import ListaPorEquipa from './ListaPorEquipa'
import { colors, styles } from '../theme'

// As Curiosidades da pelada.
//
// Jogos que nunca vão acontecer, simulados como se fossem acontecer. Não
// decidem nada e não tocam em nada gravado — existem para dar conversa ao
// grupo, que é o que uma tabela de ranking nunca consegue.
//
// A lógica toda vive em `lib/curiosidades.js` (que reutiliza o sorteio a sério
// e o motor de simulação) e tem testes. Aqui é só desenho.

// "Voltar a sortear" muda a semente. O mesmo truque do sorteio e da resenha:
// o resultado é reproduzível, e pedir outro é pedir outra tentativa.
const novaSemente = (base, n) => `${base}-${n}`

function BarraDeProbabilidade({ prob, nomeA, nomeB }) {
  const pct = (v) => Math.round(v * 100)
  const linhas = [
    { rotulo: nomeA, valor: pct(prob.a), cor: colors.teamA },
    { rotulo: 'Empate', valor: pct(prob.empate), cor: colors.muted },
    { rotulo: nomeB, valor: pct(prob.b), cor: colors.teamB },
  ]
  return (
    <div className="pb-stack-sm" role="group" aria-label="Probabilidades">
      {linhas.map((l) => (
        <div key={l.rotulo} className="pb-cur-linha">
          <span className="pb-cur-rot pb-truncate">{l.rotulo}</span>
          <span className="pb-cur-barra">
            <span
              className="pb-cur-fita"
              style={{ width: `${l.valor}%`, background: l.cor }}
              aria-hidden
            />
          </span>
          <span className="pb-cur-pct">{l.valor}%</span>
        </div>
      ))}
    </div>
  )
}

// Ataque / meio / defesa lado a lado. É a comparação que explica o placar.
function Comparacao({ a, b, nomeA, nomeB }) {
  const linhas = [
    ['Ataque', a.ataque, b.ataque],
    ['Meio', a.meio, b.meio],
    ['Defesa', a.defesa, b.defesa],
    ['Overall médio', a.overallMedio, b.overallMedio],
  ]
  return (
    <table className="pb-cur-tab">
      <caption className="pb-cur-cap">Forças</caption>
      <thead>
        <tr>
          <th scope="col" className="pb-truncate">
            {nomeA}
          </th>
          <th scope="col" />
          <th scope="col" className="pb-truncate">
            {nomeB}
          </th>
        </tr>
      </thead>
      <tbody>
        {linhas.map(([rotulo, va, vb]) => (
          <tr key={rotulo}>
            <td className={va >= vb ? 'is-melhor' : undefined}>{va.toFixed(1)}</td>
            <th scope="row">{rotulo}</th>
            <td className={vb >= va ? 'is-melhor' : undefined}>{vb.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Duelo({ duelo, titulo, subtitulo, icone, onOutro, onAbrirJogador }) {
  if (!duelo?.completo) {
    return (
      <section className="pb-card">
        <h2 className="pb-cur-tit">
          <span aria-hidden>{icone}</span> {titulo}
        </h2>
        <p style={{ ...styles.mutedText, fontSize: 13, margin: 0 }}>{duelo?.motivo}</p>
      </section>
    )
  }

  const s = duelo.simulacao
  const numeros = numerosDoDuelo(duelo)
  const destaques = destaquesDoDuelo(duelo)

  // O campo quer o formato da escalação de um jogo a sério.
  const lineup = [...duelo.lineupA, ...duelo.lineupB].map((j, i) => ({
    player_id: j.id,
    name: j.name,
    photo: j.photo,
    team: i < duelo.lineupA.length ? 'A' : 'B',
    assigned_position: j.slot,
    is_goalkeeper: j.slot === 'GK',
    overall_at_draw: j.slot === 'GK' ? (j.gkOverall ?? j.overall) : j.overall,
  }))

  return (
    <section className="pb-card pb-stack">
      <div>
        <h2 className="pb-cur-tit">
          <span aria-hidden>{icone}</span> {titulo}
        </h2>
        <p style={{ ...styles.mutedText, fontSize: 12, margin: '4px 0 0' }}>{subtitulo}</p>
      </div>

      {/* placar */}
      <div className="pb-cur-placar">
        <span className="pb-truncate">{s.nomeA}</span>
        <strong>
          {s.golosA} <span aria-hidden>×</span> {s.golosB}
        </strong>
        <span className="pb-truncate">{s.nomeB}</span>
      </div>

      <p className="pb-cur-equilibrio">
        ⚖️ Equilíbrio: <strong>{duelo.equilibrio.rotulo}</strong> ·{' '}
        {duelo.equilibrio.pct.toFixed(1)}% · forças {duelo.equilibrio.forcaA}/
        {duelo.equilibrio.forcaB}
      </p>

      <FootballPitch
        lineup={lineup}
        showOverall
        interactive={!!onAbrirJogador}
        onPlayerClick={onAbrirJogador ? (j) => onAbrirJogador(j.id) : undefined}
      />

      <BarraDeProbabilidade prob={s.probabilidades} nomeA={s.nomeA} nomeB={s.nomeB} />

      <Comparacao a={s.forcas.a} b={s.forcas.b} nomeA={s.nomeA} nomeB={s.nomeB} />

      <div>
        <ListaPorEquipa
          titulo="Gols"
          icone="⚽"
          a={s.marcadores.a}
          b={s.marcadores.b}
          nomeA={s.nomeA}
          nomeB={s.nomeB}
        />
        <ListaPorEquipa
          titulo="Assistências"
          icone="🎯"
          a={s.assistencias.a}
          b={s.assistencias.b}
          nomeA={s.nomeA}
          nomeB={s.nomeB}
        />
        {s.craque && (
          <p style={{ fontSize: 13, margin: '0 0 4px' }}>
            <span aria-hidden style={{ marginRight: 6 }}>
              ⭐
            </span>
            <span style={{ color: colors.muted }}>Craque: </span>
            {s.craque.name}
          </p>
        )}
        {s.bagre && (
          <p style={{ fontSize: 13, margin: '0 0 4px' }}>
            <span aria-hidden style={{ marginRight: 6 }}>
              🐟
            </span>
            <span style={{ color: colors.muted }}>Bagre: </span>
            {s.bagre.name}
          </p>
        )}
        {s.melhorGoleiro && (
          <p style={{ fontSize: 13, margin: 0 }}>
            <span aria-hidden style={{ marginRight: 6 }}>
              🧤
            </span>
            <span style={{ color: colors.muted }}>Melhor goleiro: </span>
            {s.melhorGoleiro.name}
          </p>
        )}
      </div>

      <p className="pb-cur-narrativa">{s.narrativa}</p>

      {destaques && (
        <div className="pb-cards-sm">
          {[
            ['Maior overall', destaques.maiorOverall],
            ['Menor overall', destaques.menorOverall],
            ['Artilheiro', destaques.artilheiro],
          ]
            .filter(([, j]) => j)
            .map(([rotulo, j]) => (
              <div key={rotulo} className="pb-cur-destaque">
                <Avatar name={j.name} photo={j.photo} size={30} />
                <span style={{ minWidth: 0 }}>
                  <span className="pb-cur-destaque-rot">{rotulo}</span>
                  <span className="pb-truncate" style={{ display: 'block', fontSize: 13 }}>
                    {j.name}
                  </span>
                  <span style={{ fontSize: 11, color: colors.muted }}>
                    {nomeDaPosicao(j.slot)} · {j.overall}
                  </span>
                </span>
              </div>
            ))}
        </div>
      )}

      {numeros.length > 0 && (
        <dl className="pb-cards-sm" style={{ margin: 0 }}>
          {numeros.map((n) => (
            <div key={n.rotulo} className="pb-cur-num">
              <dt>{n.rotulo}</dt>
              <dd>{n.valor}</dd>
            </div>
          ))}
        </dl>
      )}

      <button type="button" onClick={onOutro} className="pb-tap" style={{ ...styles.buttonGhost, fontSize: 13 }}>
        🎲 Simular outra vez
      </button>
    </section>
  )
}

export default function CuriosidadesScreen({ jogadores, onAbrirJogador }) {
  // Cada duelo tem a sua tentativa: pedir outro melhor jogo não mexe nos
  // perebas, que a pessoa pode estar a ler.
  const [tentativaMelhor, setTentativaMelhor] = useState(0)
  const [tentativaPerebas, setTentativaPerebas] = useState(0)

  const melhor = useMemo(
    () => melhorJogoPossivel({ jogadores, seed: novaSemente('melhor-jogo', tentativaMelhor) }),
    [jogadores, tentativaMelhor]
  )
  const perebas = useMemo(
    () => dueloDosPerebas({ jogadores, seed: novaSemente('perebas', tentativaPerebas) }),
    [jogadores, tentativaPerebas]
  )

  return (
    <div className="pb-stack">
      <p style={{ ...styles.mutedText, fontSize: 13, margin: 0 }}>
        Jogos que nunca vão acontecer, simulados como se fossem acontecer. Não decidem nada e não
        são o sorteio — são para discutir no grupo.
      </p>

      <Duelo
        duelo={melhor}
        titulo="O melhor jogo possível"
        subtitulo="Os melhores do plantel, repartidos em duas equipas equilibradas. Não é os melhores contra os seguintes — isso dava um jogo morto."
        icone="🏆"
        onOutro={() => setTentativaMelhor((n) => n + 1)}
        onAbrirJogador={onAbrirJogador}
      />

      <Campeonato jogadores={jogadores} />

      <Duelo
        duelo={perebas}
        titulo="Duelo dos Perebas"
        subtitulo="O mesmo, pelo outro lado da tabela. Quem ainda não tem overall a sério fica de fora — não se entra aqui por ter chegado há duas semanas."
        icone="😅"
        onOutro={() => setTentativaPerebas((n) => n + 1)}
        onAbrirJogador={onAbrirJogador}
      />
    </div>
  )
}
