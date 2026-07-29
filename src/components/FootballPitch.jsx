import { memo, useId, useMemo } from 'react'
import {
  FIELD_SLOTS,
  PLAYER_TYPE,
  foraDePosicao,
  iconeDaPosicao,
  nomeDaPosicao,
  posicao,
  siglaDaPosicao,
} from '../lib/positions'
import { colors, fonts } from '../theme'

// Campo de futebol 7 com as duas equipas desenhadas nos seus lugares.
//
// O componente é puro: recebe as equipas já montadas (pelo motor de sorteio)
// ou as linhas cruas de `get_next_match()` e limita-se a desenhar. Não fala
// com a API nem guarda estado — a Home re-renderiza a cada segundo por causa
// da contagem regressiva e o campo não pode voltar a desenhar-se por isso.

// Cores por defeito: as mesmas que a app já usa no sorteio.
const EQUIPA_A_PADRAO = { nome: '⚫ Pretos', cor: '#8A96A0' }
const EQUIPA_B_PADRAO = { nome: '⚪ Brancos', cor: '#F2F5F2' }

// Tudo o que é tamanho vem em clamp(): a mesma marcação tem de servir um
// telemóvel de 320px e um ecrã grande sem nunca transbordar do campo.
// A largura do chip vem daqui em vez de literal porque a metade dela é
// precisa para o travão que impede o chip de sair do campo.
const CHIP = { min: 50, vw: 16.5, max: 82 }
const T = {
  chip: `clamp(${CHIP.min}px, ${CHIP.vw}vw, ${CHIP.max}px)`,
  meioChip: `clamp(${CHIP.min / 2}px, ${CHIP.vw / 2}vw, ${CHIP.max / 2}px)`,
  avatar: 'clamp(26px, 8.5vw, 42px)',
  nome: 'clamp(9px, 2.9vw, 12px)',
  badge: 'clamp(15px, 4.6vw, 21px)',
  badgeTexto: 'clamp(8px, 2.4vw, 11px)',
  icone: 'clamp(14px, 4.2vw, 19px)',
  iconeTexto: 'clamp(8px, 2.4vw, 11px)',
  sigla: 'clamp(7px, 2.1vw, 10px)',
  etiqueta: 'clamp(9px, 2.6vw, 12px)',
  dica: 'clamp(10px, 2.7vw, 12px)',
}

// Sete jogadores num campo de 260px (telemóvel a 320px) dão ~53px por nome.
// "Diogo Re…" não se lê; "Diogo R." lê-se. O nome completo continua no
// tooltip, no title e no aria-label — nada se perde.
export function nomeCurto(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return partes[0] || ''
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`
}

const LINHA = 'rgba(234, 242, 236, 0.28)'
const FUNDO_TEXTO = 'rgba(6, 19, 13, 0.78)'

// Só o que precisa mesmo de pseudo-classes (hover/focus) fica em CSS; o
// resto são objetos inline, como no resto da app. `prefers-reduced-motion`
// desliga as transições, tal como o index.css já faz para os botões.
const CSS = `
.fp-item:hover, .fp-item:focus-within { z-index: 6; }
.fp-tip { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 130ms ease; }
.fp-av { transition: transform 140ms ease; }
@media (hover: hover) and (pointer: fine) {
  .fp-item:hover .fp-tip, .fp-item:focus-within .fp-tip { opacity: 1; visibility: visible; }
  .fp-on:hover .fp-av, .fp-on:focus-visible .fp-av { transform: translateY(-2px); }
}
@media (prefers-reduced-motion: reduce) {
  .fp-tip, .fp-av { transition: none; }
  .fp-on:hover .fp-av, .fp-on:focus-visible .fp-av { transform: none; }
}
`

// ---------- geometria ----------
// Os `x`/`y` de POSITIONS são percentagens dentro de meia-campo, com a baliza
// em baixo (y = 100). A equipa B ocupa a metade de baixo tal e qual; a A ocupa
// a de cima com a formação virada — uma rotação de 180°, por isso o x também
// espelha. Depois encolhe-se tudo para uma faixa com margem, senão metade do
// chip do goleiro ficava cortada pela linha de fundo.
const MARGEM_X = 2
const MARGEM_Y = 5

function lugarNoCampo(pos, lado, horizontal) {
  const x = lado === 'A' ? 100 - pos.x : pos.x
  const y = lado === 'A' ? 50 - pos.y / 2 : 50 + pos.y / 2
  const left = MARGEM_X + (x * (100 - 2 * MARGEM_X)) / 100
  const top = MARGEM_Y + (y * (100 - 2 * MARGEM_Y)) / 100
  // O campo horizontal é o vertical rodado -90°: (left, top) → (top, 100-left).
  return horizontal ? { left: top, top: 100 - left } : { left, top }
}

// A margem acima é uma percentagem e o chip tem largura absoluta: no campo
// horizontal o eixo longo passa a ser o x e o goleiro cai a 8,6% da esquerda,
// menos de meio chip — metade dele saía pela linha e o `overflow: hidden` do
// campo cortava-a. Este travão segura a percentagem a meio chip de cada lado,
// em CSS puro (medir a largura em JavaScript obrigaria a re-render).
const dentro = (pct) => `clamp(${T.meioChip}, ${pct}%, calc(100% - ${T.meioChip}))`

// ---------- normalização ----------
// O campo é usado em dois sítios com formatos diferentes: a pré-visualização
// do sorteio passa os objetos do motor, a Home passa as linhas da base de
// dados. Traduzir os dois aqui evita que cada ecrã invente o seu.

const numero = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizarJogador(fonte, slot) {
  if (!fonte) return null
  const id = fonte.id ?? fonte.player_id
  if (id == null) return null

  // `was_out_of_position` vem decidido pela BD; nos objetos do motor
  // calculamo-lo, mas só quando a posição principal é conhecida — sem ela
  // não é "fora de posição", é falta de informação.
  const fora =
    fonte.was_out_of_position != null
      ? fonte.was_out_of_position === true
      : slot !== 'GK' && Boolean(fonte.primaryPosition) && foraDePosicao(fonte, slot)

  return {
    id,
    slot,
    name: fonte.name || 'Sem nome',
    photo: fonte.photo ?? fonte.photo_url ?? null,
    overall: numero(fonte.overall ?? fonte.overall_at_draw),
    fora,
    // nome de quem desistiu e lhe deixou o lugar (só existe depois de uma
    // substituição gravada, migração 0018)
    substitui: fonte.substitute_for ?? fonte.substituiu ?? null,
  }
}

const idDe = (j) => j?.id ?? j?.player_id ?? null

// O motor devolve `isGoalkeeper`/`assignedPosition` em camelCase e a base de
// dados `is_goalkeeper`/`assigned_position` — falhar um destes fazia o goleiro
// desaparecer do campo e empurrar um jogador de linha para fora do onze.
const ehGoleiro = (j) =>
  Boolean(j) &&
  (j.isGoalkeeper === true ||
    j.is_goalkeeper === true ||
    j.playerType === PLAYER_TYPE.GOALKEEPER ||
    j.player_type === PLAYER_TYPE.GOALKEEPER ||
    j.assignedPosition === 'GK' ||
    j.assigned_position === 'GK' ||
    j.primaryPosition === 'GK')

const slotDe = (j) =>
  j?.slot ?? j?.assignedPosition ?? j?.assigned_position ?? j?.primaryPosition ?? null

// `slots` pode chegar como mapa {slot: jogador}, como lista de pares
// {slot, jogador} ou como lista simples pela ordem de FIELD_SLOTS.
function mapaDeSlots(slots, jogadores) {
  const mapa = {}
  const sobra = [] // sem lugar próprio: são colocados no fim, nos que restarem
  const vistos = new Set()

  // Um lugar só é ocupado uma vez e o mesmo jogador só entra uma vez; os
  // goleiros nunca entram, têm o seu sítio à parte.
  const por = (slot, jogador) => {
    if (!jogador || slot === 'GK' || ehGoleiro(jogador)) return
    const id = idDe(jogador)
    if (id != null) {
      if (vistos.has(id)) return
      vistos.add(id)
    }
    if (slot && FIELD_SLOTS.includes(slot) && !mapa[slot]) mapa[slot] = jogador
    else sobra.push(jogador)
  }

  if (Array.isArray(slots)) {
    // Numa lista, o lugar declarado manda sempre; a ordem só decide para quem
    // não o declara — senão uma lista do motor fora de ordem trocava toda a
    // gente de posição em silêncio.
    const itens = slots.map((item, i) => {
      if (!item) return null
      const jogador = item.jogador ?? item.player ?? (idDe(item) != null ? item : null)
      return { indice: i, jogador, slot: item.position ?? slotDe(item) ?? slotDe(jogador) }
    })
    for (const it of itens) if (it?.slot) por(it.slot, it.jogador)
    for (const it of itens) if (it && !it.slot) por(FIELD_SLOTS[it.indice], it.jogador)
  } else if (slots && typeof slots === 'object') {
    for (const [slot, jogador] of Object.entries(slots)) por(slot, jogador)
  }

  // Quem não veio em `slots` entra pela posição que traz consigo.
  for (const j of Array.isArray(jogadores) ? jogadores : []) {
    if (!j || (idDe(j) != null && vistos.has(idDe(j)))) continue
    por(slotDe(j), j)
  }

  // Quem sobrar (sem posição, ou com o lugar já tomado) ocupa o primeiro
  // livre — mais vale desenhá-lo fora do sítio ideal do que fazê-lo
  // desaparecer do campo.
  for (const j of sobra) {
    const livre = FIELD_SLOTS.find((s) => !mapa[s])
    if (!livre) break
    mapa[livre] = j
  }

  return mapa
}

function normalizarEquipa(equipa, lado) {
  const padrao = lado === 'A' ? EQUIPA_A_PADRAO : EQUIPA_B_PADRAO
  const e = equipa || {}
  const jogadores = Array.isArray(e.jogadores) ? e.jogadores : []
  const bruto = e.goalkeeper ?? e.gk ?? e.goleiro ?? jogadores.find(ehGoleiro) ?? null
  const mapa = mapaDeSlots(e.slots, jogadores)

  return {
    lado,
    nome: e.nome || e.name || padrao.nome,
    cor: e.cor || e.color || padrao.cor,
    forca: e.strength == null ? null : numero(e.strength),
    gk: normalizarJogador(bruto, 'GK'),
    campo: FIELD_SLOTS.map((slot) => ({ slot, jogador: normalizarJogador(mapa[slot], slot) })),
  }
}

// Linhas cruas de `get_next_match()` → o mesmo formato das equipas do motor.
function equipasDeLineup(lineup) {
  const cru = { A: { jogadores: [], goalkeeper: null, slots: {} }, B: { jogadores: [], goalkeeper: null, slots: {} } }
  for (const r of Array.isArray(lineup) ? lineup : []) {
    const lado = r?.team === 'A' ? 'A' : r?.team === 'B' ? 'B' : null
    if (!lado) continue
    // O lugar gravado manda sobre o `is_goalkeeper`, e nada sobrepõe um lugar
    // já ocupado: uma linha estranha na base de dados podia apagar outra e
    // fazer um jogador desaparecer do campo em silêncio.
    const slot = FIELD_SLOTS.includes(r.assigned_position) ? r.assigned_position : null
    if (slot && !cru[lado].slots[slot]) cru[lado].slots[slot] = r
    else if (!slot && ehGoleiro(r) && !cru[lado].goalkeeper) cru[lado].goalkeeper = r
    else cru[lado].jogadores.push(r)
  }
  return cru
}

// ---------- relva e linhas ----------
// Desenhado sempre na vertical (100 × 150) e rodado para o modo horizontal,
// para não haver dois conjuntos de marcações a divergir com o tempo.
function Relva({ horizontal, idBase }) {
  const relva = `${idBase}-relva`
  const vinheta = `${idBase}-vinheta`

  return (
    <svg
      viewBox={horizontal ? '0 0 150 100' : '0 0 100 150'}
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <linearGradient id={relva} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12301E" />
          <stop offset="50%" stopColor="#0D2417" />
          <stop offset="100%" stopColor="#12301E" />
        </linearGradient>
        <radialGradient id={vinheta} cx="50%" cy="50%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${relva})`} />

      <g transform={horizontal ? 'translate(0 100) rotate(-90)' : undefined}>
        {/* corte da relva: faixas quase impercetíveis, só para dar textura */}
        {Array.from({ length: 10 }).map((_, i) =>
          i % 2 ? <rect key={i} x="0" y={i * 15} width="100" height="15" fill="rgba(255,255,255,0.017)" /> : null,
        )}

        <g fill="none" stroke={LINHA} strokeWidth="0.55" strokeLinecap="round">
          <rect x="5" y="5" width="90" height="140" />
          <line x1="5" y1="75" x2="95" y2="75" />
          <circle cx="50" cy="75" r="10" />
          {/* grandes áreas */}
          <rect x="25" y="5" width="50" height="20" />
          <rect x="25" y="125" width="50" height="20" />
          {/* pequenas áreas */}
          <rect x="38" y="5" width="24" height="8" />
          <rect x="38" y="137" width="24" height="8" />
          {/* cantos */}
          <path d="M5 8 A3 3 0 0 0 8 5" />
          <path d="M92 5 A3 3 0 0 0 95 8" />
          <path d="M5 142 A3 3 0 0 1 8 145" />
          <path d="M92 145 A3 3 0 0 1 95 142" />
        </g>

        <g fill={LINHA}>
          <circle cx="50" cy="75" r="0.8" />
          <circle cx="50" cy="18" r="0.8" />
          <circle cx="50" cy="132" r="0.8" />
        </g>

        {/* balizas */}
        <g fill="rgba(234,242,236,0.10)" stroke="rgba(234,242,236,0.45)" strokeWidth="0.5">
          <rect x="42" y="2.4" width="16" height="2.6" />
          <rect x="42" y="145" width="16" height="2.6" />
        </g>
      </g>

      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${vinheta})`} />
    </svg>
  )
}

// ---------- peças do chip ----------

// Foto redonda ou iniciais. É o Avatar da casa redesenhado em unidades
// fluidas: aquele recebe o tamanho em píxeis fixos e aqui o chip tem de
// encolher com o campo sem medir nada em JavaScript.
function Cara({ name, photo, cor }) {
  const base = {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: `2px solid ${cor}`,
    display: 'block',
  }
  if (photo) return <img src={photo} alt="" style={{ ...base, objectFit: 'cover' }} />

  const iniciais = (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <span
      style={{
        ...base,
        background: '#16261F',
        color: colors.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: fonts.title,
        fontWeight: 600,
        fontSize: T.badgeTexto,
        letterSpacing: 1,
      }}
    >
      {iniciais}
    </span>
  )
}

// Lugar por preencher: círculo tracejado com a sigla da posição.
function Vazio({ slot }) {
  return (
    <span
      role="img"
      aria-label={`Lugar livre: ${nomeDaPosicao(slot)}`}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        border: `2px dashed ${colors.line}`,
        background: 'rgba(6, 19, 13, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: fonts.title,
        fontSize: T.sigla,
        color: colors.muted,
        letterSpacing: 0.5,
      }}
    >
      {siglaDaPosicao(slot)}
    </span>
  )
}

const anelBase = {
  position: 'absolute',
  borderRadius: '50%',
  pointerEvents: 'none',
}

// Um jogador (ou o lugar vazio) no seu sítio do campo.
function Chip({ jogador, slot, cor, pos, destacado, showOverall, interactive, onPlayerClick }) {
  const nomePos = nomeDaPosicao(slot)
  const overall = jogador?.overall == null ? null : Math.round(jogador.overall)
  // A dica sai para dentro do campo: em cima abre para baixo, em baixo abre
  // para cima, e nas alas encosta ao lado certo — senão era cortada.
  const abaixo = pos.top < 50
  const encostaEsq = pos.left < 24
  const encostaDir = pos.left > 76

  const conteudo = (
    <>
      <span className="fp-av" style={{ position: 'relative', width: T.avatar, height: T.avatar }}>
        {jogador ? <Cara name={jogador.name} photo={jogador.photo} cor={cor} /> : <Vazio slot={slot} />}

        {jogador?.fora && (
          <span
            aria-hidden
            title={`${jogador.name} está fora da posição principal`}
            style={{
              ...anelBase,
              inset: -3,
              border: `2px dashed ${colors.teamA}`,
              pointerEvents: 'auto',
            }}
          />
        )}

        {destacado && (
          <span
            aria-hidden
            style={{
              ...anelBase,
              inset: -6,
              border: `2px solid ${colors.grass}`,
              boxShadow: `0 0 10px rgba(52, 208, 88, 0.55)`,
            }}
          />
        )}

        {jogador && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -3,
              left: -3,
              width: T.icone,
              height: T.icone,
              borderRadius: '50%',
              background: FUNDO_TEXTO,
              border: `1px solid ${colors.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: T.iconeTexto,
              lineHeight: 1,
            }}
          >
            {iconeDaPosicao(slot)}
          </span>
        )}

        {jogador?.substitui && (
          <span
            aria-hidden
            title={`${jogador.name} entrou no lugar de ${jogador.substitui} (desistência)`}
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: T.icone,
              height: T.icone,
              borderRadius: '50%',
              background: colors.teamA,
              color: '#06130D',
              border: `1px solid ${colors.teamA}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: T.iconeTexto,
              fontWeight: 700,
              lineHeight: 1,
              pointerEvents: 'auto',
            }}
          >
            🔄
          </span>
        )}

        {jogador && showOverall && overall != null && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              minWidth: T.badge,
              height: T.badge,
              padding: '0 3px',
              borderRadius: 999,
              background: cor,
              color: '#06130D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.title,
              fontWeight: 700,
              fontSize: T.badgeTexto,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {overall}
          </span>
        )}
      </span>

      {jogador && (
        <span
          title={jogador.name}
          style={{
            display: 'block',
            maxWidth: '100%',
            marginTop: 3,
            padding: '1px 5px',
            borderRadius: 6,
            background: FUNDO_TEXTO,
            color: colors.text,
            fontSize: T.nome,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: 0.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {nomeCurto(jogador.name)}
        </span>
      )}

      {jogador && (
        <span
          className="fp-tip"
          aria-hidden
          style={{
            position: 'absolute',
            zIndex: 8,
            [abaixo ? 'top' : 'bottom']: 'calc(100% + 6px)',
            left: encostaEsq ? 0 : encostaDir ? 'auto' : '50%',
            right: encostaDir ? 0 : 'auto',
            transform: encostaEsq || encostaDir ? 'none' : 'translateX(-50%)',
            padding: '4px 8px',
            borderRadius: 8,
            background: 'rgba(6, 19, 13, 0.96)',
            border: `1px solid ${colors.line}`,
            color: colors.text,
            fontSize: T.dica,
            fontWeight: 500,
            lineHeight: 1.35,
            // sem largura máxima, um nome comprido esticava a dica para lá da
            // linha lateral e o `overflow: hidden` do campo cortava-a
            maxWidth: 'min(60vw, 200px)',
            overflowWrap: 'anywhere',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
          }}
        >
          {jogador.name} · {nomePos}
          {overall == null ? '' : ` · ${overall}`}
          {jogador.fora ? ' · fora de posição' : ''}
          {jogador.substitui ? ` · entrou por ${jogador.substitui} (desistência)` : ''}
        </span>
      )}
    </>
  )

  const interno = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  }

  if (interactive && jogador) {
    const aria = `${jogador.name}, ${nomePos}${overall == null ? '' : `, overall ${overall}`}${
      jogador.fora ? ', fora da posição principal' : ''
    }${jogador.substitui ? `, entrou por desistência de ${jogador.substitui}` : ''}`
    return (
      <button
        type="button"
        className="fp-chip fp-on"
        aria-label={aria}
        onClick={onPlayerClick ? () => onPlayerClick(jogador) : undefined}
        style={{
          ...interno,
          background: 'none',
          border: 0,
          padding: 0,
          margin: 0,
          color: 'inherit',
          font: 'inherit',
          textAlign: 'center',
          cursor: onPlayerClick ? 'pointer' : 'default',
        }}
      >
        {conteudo}
      </button>
    )
  }

  return (
    <span className="fp-chip" style={interno}>
      {conteudo}
    </span>
  )
}

// Etiqueta da equipa, encostada ao canto do seu lado do campo.
function Etiqueta({ equipa, canto }) {
  return (
    <span
      style={{
        position: 'absolute',
        ...canto,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '46%',
        padding: '3px 9px',
        borderRadius: 999,
        background: FUNDO_TEXTO,
        border: `1px solid ${equipa.cor}`,
        fontSize: T.etiqueta,
        color: colors.text,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontFamily: fonts.title,
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {equipa.nome}
      </span>
      {equipa.forca != null && (
        <span style={{ color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(equipa.forca * 10) / 10}
        </span>
      )}
    </span>
  )
}

// Frase para leitores de ecrã quando o campo não é interativo. O aro tracejado
// de "fora de posição" só tem um `title`, que num contentor `aria-hidden` não
// chega a ninguém — por isso vai também por escrito aqui.
function descrever(equipas) {
  return equipas
    .map((e) => {
      const linha = [e.gk, ...e.campo.map((c) => c.jogador)]
        .filter(Boolean)
        .map(
          (j) =>
            `${j.name} ${nomeDaPosicao(j.slot).toLowerCase()}${
              j.fora ? ' (fora da posição principal)' : ''
            }${j.substitui ? ` (entrou por desistência de ${j.substitui})` : ''}`,
        )
        .join(', ')
      return `${e.nome}: ${linha || 'sem jogadores'}`
    })
    .join('. ')
}

function FootballPitch({
  teamA,
  teamB,
  lineup,
  orientation = 'vertical',
  showOverall = true,
  interactive = false,
  onPlayerClick,
  destaqueIds,
}) {
  const horizontal = orientation === 'horizontal'
  const idBase = useId().replace(/:/g, '')

  // O trabalho pesado (normalizar e posicionar) fica aqui: a Home
  // re-renderiza com a contagem regressiva e isto não pode repetir-se.
  const equipas = useMemo(() => {
    const temExplicito = teamA != null || teamB != null
    const cru = temExplicito ? { A: teamA, B: teamB } : equipasDeLineup(lineup)
    return ['A', 'B'].map((lado) => {
      const e = normalizarEquipa(cru[lado], lado)
      const lugares = [
        { slot: 'GK', jogador: e.gk, pos: lugarNoCampo(posicao('GK'), lado, horizontal) },
        ...e.campo.map((c) => ({
          slot: c.slot,
          jogador: c.jogador,
          pos: lugarNoCampo(posicao(c.slot), lado, horizontal),
        })),
      ]
      return { ...e, lugares }
    })
  }, [teamA, teamB, lineup, horizontal])

  const destacado = (id) => Boolean(destaqueIds && destaqueIds.length && destaqueIds.includes(id))

  const moldura = {
    position: 'relative',
    width: '100%',
    aspectRatio: horizontal ? '3 / 2' : '2 / 3',
    borderRadius: 16,
    overflow: 'hidden',
    border: `1px solid ${colors.line}`,
    background: '#0D2417',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.28)',
  }

  const cantos = horizontal
    ? [{ top: 8, left: 8 }, { top: 8, right: 8 }]
    : [{ top: 8, left: 8 }, { bottom: 8, left: 8 }]

  const marcadores = equipas.flatMap((e) =>
    e.lugares.map(({ slot, jogador, pos }) => {
      const Caixa = interactive ? 'li' : 'span'
      return (
        <Caixa
          key={`${e.lado}-${slot}`}
          className="fp-item"
          style={{
            position: 'absolute',
            left: dentro(pos.left),
            top: `${pos.top}%`,
            transform: 'translate(-50%, -50%)',
            width: T.chip,
            listStyle: 'none',
            display: 'block',
          }}
        >
          <Chip
            jogador={jogador}
            slot={slot}
            cor={e.cor}
            pos={pos}
            destacado={jogador ? destacado(jogador.id) : false}
            showOverall={showOverall}
            interactive={interactive}
            onPlayerClick={onPlayerClick}
          />
        </Caixa>
      )
    }),
  )

  const descricao = `Campo de futebol 7, formação 2-3-1. ${descrever(equipas)}.`
  // Sendo interativo, cada botão já se anuncia a si próprio: repetir o plantel
  // no rótulo da lista obrigava a ouvir tudo duas vezes.
  const rotuloLista = `Campo de futebol 7, formação 2-3-1: ${equipas[0].nome} contra ${equipas[1].nome}`
  const camada = { position: 'absolute', inset: 0, margin: 0, padding: 0, listStyle: 'none' }

  return (
    <div style={moldura} {...(interactive ? {} : { role: 'img', 'aria-label': descricao })}>
      <style>{CSS}</style>
      <Relva horizontal={horizontal} idBase={idBase} />

      {interactive ? (
        // `role="list"` explícito: com `list-style: none` o Safari deixa de a
        // tratar como lista e o VoiceOver perde a contagem dos jogadores.
        <ul role="list" aria-label={rotuloLista} style={camada}>
          {marcadores}
        </ul>
      ) : (
        <div style={camada} aria-hidden="true">
          {marcadores}
        </div>
      )}

      {equipas.map((e, i) => (
        <Etiqueta key={e.lado} equipa={e} canto={cantos[i]} />
      ))}
    </div>
  )
}

const listasIguais = (a, b) => {
  if (a === b) return true
  const x = a || []
  const y = b || []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

// A Home re-renderiza a cada segundo por causa da contagem regressiva e o
// campo não se pode redesenhar por isso. `destaqueIds` costuma chegar como
// literal novo (`[]`), o que sozinho já furava o memo — por isso é comparado
// pelo conteúdo. O resto vai por referência: passa `onPlayerClick` num
// `useCallback` e as equipas num `useMemo`.
function saoIguais(a, b) {
  return (
    a.teamA === b.teamA &&
    a.teamB === b.teamB &&
    a.lineup === b.lineup &&
    a.orientation === b.orientation &&
    a.showOverall === b.showOverall &&
    a.interactive === b.interactive &&
    a.onPlayerClick === b.onPlayerClick &&
    listasIguais(a.destaqueIds, b.destaqueIds)
  )
}

export default memo(FootballPitch, saoIguais)
