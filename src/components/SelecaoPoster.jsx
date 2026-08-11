import { useMemo, useState } from 'react'
import { POSITIONS, nomeDaPosicao, siglaDaPosicao } from '../lib/positions'
import { renderSelecaoImagem } from '../lib/selecaoImagem'
import { partilharDataUrl } from '../lib/share'
import { nomeCurto } from './FootballPitch'
import { colors } from '../theme'

// A Seleção da Pelada desenhada como um pôster, e não como um painel.
//
// Porquê um componente à parte e não o `FootballPitch`: aquele é o campo de um
// JOGO — relva verde, duas equipas, rodízio, badges de substituição — e vive em
// seis ecrãs, incluindo três do admin. Aqui é uma equipa só, sobre um fundo
// azul-escuro, com o jogador em primeiro lugar e o campo reduzido a linhas.
// Mudar o `FootballPitch` para servir os dois obrigava-o a ter dois aspetos e
// arrastava a mudança para os seis sítios.
//
// O que se reutiliza é o que interessa: as COORDENADAS. Os x/y de `POSITIONS`
// são os mesmos que o campo a sério usa, portanto a formação aqui é a mesma
// formação de lá — não há uma segunda verdade sobre onde joga um ala.
//
// Não decide nada: quem entra na seleção continua a ser decidido em
// `lib/selecao.js`, que não foi tocado.

// Geometria, e cada número tem uma razão.
//
// As filas do 2-3-1 estão em y = 20 / 45-48 / 72 / 92, e as colunas em
// x = 17 / 30 / 50 / 70 / 83. Daí saem duas distâncias apertadas:
//
//   GK ↔ DEF    20% da largura, 20% da altura
//   ala ↔ DEF   13% da largura, 27% da altura
//
// A primeira tentativa deu o cartão a 24% da largura, e não fechava: com a
// foto em 4/5 mais o nome, a posição e a estatística, o cartão ficava com
// 134px de altura e o par GK↔DEF só oferece 20% da altura — 90px. Sobrepunham
// -se 44px.
//
// A 19% o cartão fica mais estreito do que os 20% de LARGURA que separam esse
// par, portanto separa-se na horizontal e deixa de precisar da altura. Sobra
// só o par ala↔DEF, cujos 13% de largura são sempre menos que o cartão: esse
// resolve-se com os 27% de altura que tem, e é ele que fixa o rácio em 1/1.5.
//
// 19% também não é mesquinho: na referência os cartões valem ~15% da largura.
const CARTAO_W = 19 // % da largura do campo
const RACIO = 1.5 // altura = largura x isto

const CSS = `
.pb-sp-pc { transition: transform 140ms ease; }
@media (hover: hover) and (pointer: fine) {
  .pb-sp-pc:hover { transform: translate(-50%, -50%) scale(1.06); z-index: 5; }
}
@keyframes pb-sp-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 14px)) scale(0.94); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes pb-sp-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.pb-sp-anim .pb-sp-pc { animation: pb-sp-in 460ms cubic-bezier(.2,.7,.3,1) backwards; }
.pb-sp-anim .pb-sp-head > * { animation: pb-sp-fade 520ms ease backwards; }
.pb-sp-anim .pb-sp-linhas { animation: pb-sp-fade 700ms ease backwards; animation-delay: 160ms; }
@media (prefers-reduced-motion: reduce) {
  .pb-sp-anim .pb-sp-pc,
  .pb-sp-anim .pb-sp-head > *,
  .pb-sp-anim .pb-sp-linhas { animation: none; }
  .pb-sp-pc { transition: none; }
  .pb-sp-pc:hover { transform: translate(-50%, -50%); }
}
`

// Entram de baixo para cima, como a referência: primeiro o guarda-redes, por
// fim o atacante. O atraso vem da fila, não da ordem da lista.
const ATRASO_POR_FILA = { GK: 0, 'DEF-L': 1, 'DEF-R': 1, 'MID-L': 2, 'MID-C': 2, 'MID-R': 2, ST: 3 }

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// O overall que conta para este jogador: o goleiro tem escala própria, como em
// todo o resto do projeto.
const overallDe = (j) => (j.slot === 'GK' ? (j.gkOverall ?? j.overall) : j.overall)

// A estatística que vale a pena mostrar DENTRO do campo — uma só, a mais
// falante. Com quatro linhas de números o cartão passava a tabela e o campo
// ficava ilegível; o resto está no modal, a um toque.
export function destaqueDe(j) {
  const gols = num(j.goals)
  const assist = num(j.assists)
  const vit = num(j.wins)
  const jogos = num(j.matches)
  if (j.slot === 'GK') return jogos ? `🧤 ${jogos} jogos` : null
  if (gols) return `⚽ ${gols} ${gols === 1 ? 'gol' : 'gols'}`
  if (assist) return `🎯 ${assist} assist.`
  if (vit) return `🏆 ${vit} ${vit === 1 ? 'vitória' : 'vitórias'}`
  return jogos ? `👟 ${jogos} jogos` : null
}

// Os números do rodapé. Ficam FORA do campo de propósito: lá dentro
// poluíam a formação, que é o que a página tem para mostrar.
export function numerosDaSelecao(lineup) {
  const campo = lineup.filter((j) => j.slot !== 'GK')
  const overalls = campo.map((j) => num(j.overall)).filter(Boolean)
  const soma = (f) => lineup.reduce((s, j) => s + num(j[f]), 0)

  // Mais decisivo = mais gols + assistências. Craque = maior overall de campo.
  // São coisas diferentes de propósito: dá para o melhor jogador não ser o que
  // mais decide, e é exatamente aí que começa a discussão.
  const porGA = [...campo].sort((a, b) => num(b.goals) + num(b.assists) - (num(a.goals) + num(a.assists)))
  const porOverall = [...campo].sort((a, b) => num(b.overall) - num(a.overall))
  const decisivo = porGA[0]
  const craque = porOverall[0]

  return {
    media: overalls.length ? (overalls.reduce((s, v) => s + v, 0) / overalls.length).toFixed(1) : null,
    gols: soma('goals'),
    assistencias: soma('assists'),
    vitorias: soma('wins'),
    decisivo: decisivo && num(decisivo.goals) + num(decisivo.assists) > 0 ? decisivo : null,
    craque: craque || null,
    craqueId: craque?.id ?? null,
  }
}

function Foto({ nome, photo }) {
  if (photo) return <img src={photo} alt="" className="pb-sp-img" />
  const iniciais = (nome || '?')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span className="pb-sp-img pb-sp-iniciais" aria-hidden>
      {iniciais}
    </span>
  )
}

function Cartao({ jogador, mvp, onAbrir }) {
  const p = POSITIONS.find((x) => x.id === jogador.slot)
  if (!p) return null
  const overall = overallDe(jogador)
  const destaque = destaqueDe(jogador)
  const aria = `${jogador.name}, ${nomeDaPosicao(jogador.slot)}${
    overall == null ? '' : `, overall ${overall}`
  }${mvp ? ', craque da seleção' : ''}${destaque ? `, ${destaque.replace(/^\S+\s/, '')}` : ''}`

  return (
    <button
      type="button"
      className={`pb-sp-pc${mvp ? ' is-mvp' : ''}`}
      style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${260 + ATRASO_POR_FILA[p.id] * 130}ms` }}
      aria-label={aria}
      onClick={onAbrir ? () => onAbrir(jogador.id) : undefined}
    >
      {/* Fora da moldura: ela tem `overflow: hidden` para recortar a foto, e
          lá dentro a coroa — que assenta na borda de cima — era cortada. */}
      {mvp && (
        <span className="pb-sp-coroa" aria-hidden title="Craque da seleção">
          👑
        </span>
      )}
      <span className="pb-sp-moldura">
        <Foto nome={jogador.name} photo={jogador.photo} />
        {overall != null && (
          <span className="pb-sp-ovr" aria-hidden>
            {Math.round(overall)}
          </span>
        )}
      </span>
      {/* `nomeCurto` e nao o nome inteiro: o cartao tem 19% da largura do
          campo e "Marcos Felipe" nao la cabe. O nome completo esta no
          `aria-label`, no modal e no perfil. */}
      <span className="pb-sp-nome" title={jogador.name}>
        {nomeCurto(jogador.name)}
      </span>
      <span className="pb-sp-meta" aria-hidden>
        {siglaDaPosicao(jogador.slot)}
      </span>
      {destaque && (
        <span className="pb-sp-stat" aria-hidden>
          {destaque}
        </span>
      )}
    </button>
  )
}

// As linhas do campo. SVG e não imagem: escala sem pesar e acompanha o tema.
function Linhas() {
  return (
    <svg
      className="pb-sp-linhas"
      viewBox="0 0 100 145"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="pbSpGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(53,167,255,0.20)" />
          <stop offset="55%" stopColor="rgba(53,167,255,0.04)" />
          <stop offset="100%" stopColor="rgba(53,167,255,0)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="145" fill="url(#pbSpGlow)" />
      <g fill="none" stroke="rgba(90,200,255,0.42)" strokeWidth="0.45">
        <rect x="4" y="4" width="92" height="137" rx="1.5" />
        <line x1="4" y1="72.5" x2="96" y2="72.5" />
        <circle cx="50" cy="72.5" r="15" />
        <rect x="26" y="4" width="48" height="20" />
        <rect x="26" y="121" width="48" height="20" />
        <rect x="39" y="4" width="22" height="8" />
        <rect x="39" y="133" width="22" height="8" />
      </g>
      <circle cx="50" cy="72.5" r="1.1" fill="rgba(90,200,255,0.5)" />
    </svg>
  )
}

export default function SelecaoPoster({
  selecao,
  titulo = 'SELEÇÃO DA PELADA',
  subtitulo,
  marca = 'PELADA BROWNS',
  onAbrirJogador,
  animar = true,
  destacarCraque = true,
  partilhavel = true,
}) {
  const [estado, setEstado] = useState('parado')
  const [recado, setRecado] = useState('')
  // O `|| []` tem de estar dentro de um useMemo: um literal novo a cada render
  // furava a memoização de `numeros` logo a seguir.
  const lineup = useMemo(() => selecao?.lineup || [], [selecao])
  const numeros = useMemo(() => numerosDaSelecao(lineup), [lineup])

  // A imagem é uma composição à parte (`lib/selecaoImagem`), não uma captura
  // desta página: a página é responsiva e uma captura levava consigo a forma
  // do ecrã de quem partilha, a barra de navegação e o que estivesse a meio de
  // uma animação. `numeros` vai daqui para a imagem dizer o mesmo que o ecrã.
  const partilhar = async () => {
    setRecado('')
    setEstado('a-gerar')
    try {
      const dataUrl = await renderSelecaoImagem({ selecao, numeros, titulo, subtitulo, marca })
      const ficheiro = `${titulo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}.jpg`
      const r = await partilharDataUrl(dataUrl, { ficheiro, titulo: `${marca} — ${titulo}` })
      // Dizer "partilhado" a quem carregou em cancelar é mentira, e dizer
      // "descarregado" quando foi mesmo partilhado manda a pessoa procurar
      // nos downloads uma coisa que já está no WhatsApp.
      if (r === 'descarregado') setRecado('Imagem guardada nos teus downloads.')
      else if (r === 'cancelado') setRecado('')
      else setRecado('Boa — agora é só colar no grupo. 🔥')
    } catch {
      setRecado('Não consegui montar a imagem. Tenta outra vez.')
    } finally {
      setEstado('parado')
    }
  }

  if (!lineup.length) {
    return (
      <div className="pb-card">
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          Ainda não há jogadores com overall calculado para montar a seleção.
        </p>
      </div>
    )
  }

  return (
    <article className={`pb-sp${animar ? ' pb-sp-anim' : ''}`}>
      <style>{CSS}</style>

      <header className="pb-sp-head">
        <p className="pb-sp-marca">{marca}</p>
        <h2 className="pb-sp-titulo">{titulo}</h2>
        {subtitulo && <p className="pb-sp-sub">{subtitulo}</p>}
      </header>

      <div
        className="pb-sp-campo"
        style={{ aspectRatio: `1 / ${RACIO}`, '--pb-sp-cw': `${CARTAO_W}%` }}
      >
        <Linhas />
        {lineup.map((j) => (
          <Cartao
            key={j.id}
            jogador={j}
            mvp={destacarCraque && j.id === numeros.craqueId && j.slot !== 'GK'}
            onAbrir={onAbrirJogador}
          />
        ))}
      </div>

      {!selecao.completa && (
        <p className="pb-sp-aviso">
          ⚠️ Ainda não há gente com overall calculado para todos os lugares — esta seleção está
          incompleta.
        </p>
      )}

      <section className="pb-sp-numeros" aria-label="Números da seleção">
        <h3 className="pb-sp-numeros-tit">Números da seleção</h3>
        <dl className="pb-sp-grelha">
          {[
            ['Overall médio', numeros.media ?? '—'],
            ['Gols', numeros.gols],
            ['Assistências', numeros.assistencias],
            ['Vitórias', numeros.vitorias],
            ['Formação', selecao.formacao || '—'],
            ['Mais decisivo', numeros.decisivo?.name || '—'],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="pb-sp-num">
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      </section>

      {partilhavel && (
        <div className="pb-sp-partilha">
          <button
            type="button"
            className="pb-sp-btn"
            onClick={partilhar}
            disabled={estado === 'a-gerar'}
          >
            {estado === 'a-gerar' ? '⏳ A montar a arte…' : '📲 Compartilhar Seleção'}
          </button>
          {recado && (
            <p className="pb-sp-recado" role="status">
              {recado}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
