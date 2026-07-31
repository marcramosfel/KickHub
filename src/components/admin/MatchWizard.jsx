import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminMatchesUpcoming,
  adminPublishMatch,
  adminSaveLineup,
  adminSaveSchedule,
  adminSetPositions,
} from '../../api'
import {
  escalarEquipasFixas,
  moverParaSlot,
  paraLinhasDeEscalacao,
  sortearEquipas,
  trocarJogadores,
  N_CAMPO,
  N_GOLEIROS,
} from '../../lib/drawEngine'
import {
  ETIQUETA_STATUS,
  FIELD_SLOTS,
  nomeDaPosicao,
  PLAYER_TYPE,
  POSITION_STATUS,
  siglaDaPosicao,
} from '../../lib/positions'
import { formatarDataDoJogo } from '../../lib/countdown'
import { calcularLiderancas } from '../../lib/achievements'
import { calcularSequencias } from '../../lib/streaks'
import { gerarResenhaSorteio } from '../../lib/resenha'
import Avatar from '../Avatar'
import FootballPitch from '../FootballPitch'
import ResenhaEditor from './ResenhaEditor'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// Criação de um jogo, passo a passo.
//
// O fluxo é longo de propósito: entre marcar a data e publicar o sorteio há
// decisões que não se desfazem (publicar fixa as equipas), por isso cada passo
// valida o seu e só deixa avançar quando está bom.

const PASSOS = [
  { id: 1, titulo: 'Informações do jogo' },
  { id: 2, titulo: 'Escolher goleiros' },
  { id: 3, titulo: 'Confirmar jogadores de campo' },
  { id: 4, titulo: 'Verificar posições' },
  { id: 5, titulo: 'Sorteio automático' },
  { id: 6, titulo: 'Rever equilíbrio' },
  { id: 7, titulo: 'Publicar' },
]

const NIVEL_COR = {
  excelente: colors.grass,
  bom: colors.grass,
  regular: colors.teamA,
  desequilibrado: colors.error,
}

// datetime-local trabalha em hora local do browser; o input dá 'YYYY-MM-DDTHH:mm'
// sem fuso e o servidor precisa de um instante. Converter aqui, num sítio só.
const paraISO = (local) => (local ? new Date(local).toISOString() : null)
const paraLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Numa conversão os passos 2 a 5 não existem: as equipas vêm do rachão e as
// posições são atribuídas sozinhas. Contar "passo 6 de 7" num fluxo de três
// ecrãs seria mentir ao admin sobre o que falta.
const PASSOS_CONVERSAO = [
  { id: 1, titulo: 'Informações do jogo' },
  { id: 6, titulo: 'Rever escalação' },
  { id: 7, titulo: 'Publicar' },
]

function Progresso({ passo, conversao }) {
  const lista = conversao ? PASSOS_CONVERSAO : PASSOS
  const indice = Math.max(0, lista.findIndex((p) => p.id === passo))
  const atual = lista[indice]
  const numero = indice + 1
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          Passo {numero} de {lista.length} — {atual?.titulo}
        </span>
      </div>
      <div
        style={{ height: 8, background: '#0C1915', borderRadius: 999, overflow: 'hidden' }}
        role="progressbar"
        aria-valuenow={numero}
        aria-valuemin={1}
        aria-valuemax={lista.length}
        aria-label={`Passo ${numero} de ${lista.length}: ${atual?.titulo}`}
      >
        <div
          style={{
            height: '100%',
            width: `${(numero / lista.length) * 100}%`,
            background: colors.grass,
            borderRadius: 999,
            transition: 'width .3s',
          }}
        />
      </div>
    </div>
  )
}

function Aviso({ tom = 'aviso', children }) {
  const cor = tom === 'erro' ? colors.error : tom === 'ok' ? colors.grass : colors.teamA
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 10,
        background: `${cor}14`,
        border: `1px solid ${cor}55`,
        fontSize: 13,
        color: colors.text,
        marginTop: 10,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0 }}>
        {tom === 'erro' ? '⛔' : tom === 'ok' ? '✅' : '⚠️'}
      </span>
      <span>{children}</span>
    </div>
  )
}

// Linha de seleção de jogador, com o estado da posição à vista.
function LinhaJogador({ j, marcado, onToggle, extra, desativado }) {
  const e = ETIQUETA_STATUS[j.positionStatus] || ETIQUETA_STATUS.NOT_SELECTED
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 4px',
        borderBottom: `1px solid ${colors.line}`,
        opacity: desativado ? 0.45 : 1,
        cursor: desativado ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={marcado}
        disabled={desativado}
        onChange={onToggle}
        style={{ width: 18, height: 18, accentColor: colors.grass, flexShrink: 0 }}
      />
      <Avatar name={j.name} photo={j.photo} size={30} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="pb-truncate" style={{ display: 'block', fontSize: 14 }}>
          {j.name}
        </span>
        <span style={{ fontSize: 11, color: colors.muted }}>
          {j.primaryPosition ? nomeDaPosicao(j.primaryPosition) : 'sem posição'} · {e.icone}{' '}
          {e.texto}
        </span>
      </span>
      {extra}
      <span
        style={{
          flexShrink: 0,
          width: 34,
          textAlign: 'center',
          fontFamily: fonts.title,
          fontSize: 15,
          fontWeight: 700,
          color: colors.teamA,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {j.overall ?? '—'}
      </span>
    </label>
  )
}

// `conversao` (duas listas de ids) chega quando um rachão sobe a jogo
// oficial. Nesse caso as equipas já estão decididas — e o rachão foi
// provavelmente usado por não haver dois goleiros fixos nesse dia — por isso
// o assistente salta a escolha de goleiros e de jogadores: marca-se a data e
// vai-se direto rever a escalação, com as posições já distribuídas.
export default function MatchWizard({ pw, jogadores, matches, conversao, onDadosAlterados }) {
  const [passo, setPasso] = useState(1)
  const [jogo, setJogo] = useState(null) // rascunho guardado no servidor
  const [proximos, setProximos] = useState([])
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  // sem a migração 0016 nenhuma destas funções existe no Supabase e o erro que
  // chega é o genérico de ligação — sem isto o admin não sabe o que lhe falta
  const [faltaMigracao, setFaltaMigracao] = useState(false)

  // passo 1
  const [quando, setQuando] = useState('')
  const [local, setLocal] = useState('Browns Sports Resort')
  const [mapa, setMapa] = useState('')

  // passos 2/3
  const [goleiros, setGoleiros] = useState([])
  const [campo, setCampo] = useState([])
  const [tornarGkPermanente, setTornarGkPermanente] = useState({})

  // passos 5/6
  const [resultado, setResultado] = useState(null)
  const [selecao, setSelecao] = useState(null) // troca manual: primeiro clique
  const [ajustado, setAjustado] = useState(false) // houve trocas feitas à mão
  const [tentativa, setTentativa] = useState(0) // quantos sorteios já se fizeram a este jogo
  // `publicado` = o jogo já está publicado (agora ou de antes);
  // `acabouDePublicar` = fomos nós, nesta passagem pelo assistente. Sem os dois
  // separados, retomar um jogo publicado mostrava o ecrã de sucesso a um
  // sorteio que nunca chegou a ser gravado.
  const [publicado, setPublicado] = useState(false)
  const [acabouDePublicar, setAcabouDePublicar] = useState(false)
  const publicandoRef = useRef(false)

  // ---------- conversão de um rachão ----------
  // Chegam as duas EQUIPAS já formadas. O assistente não volta a pedir
  // goleiros nem jogadores: as equipas ficam como estão e só se distribuem
  // as posições. `equipasFixas` guarda-as; enquanto existirem, os passos
  // 2 a 5 não têm nada para fazer e ficam de fora do caminho.
  //
  // Guardadas durante o render (o componente fica montado, não há
  // inicializador que as apanhe) e uma só vez por conversão: é um array
  // novo a cada "transformar em oficial", e a comparação por referência
  // distingue uma conversão nova de um simples re-render.
  const [equipasFixas, setEquipasFixas] = useState(null)
  const [conversaoAplicada, setConversaoAplicada] = useState(null)
  if (Array.isArray(conversao) && conversao.length === 2 && conversao !== conversaoAplicada) {
    setConversaoAplicada(conversao)
    setEquipasFixas(conversao)
    setResultado(null)
    setAjustado(false)
    setTentativa(0)
  }
  const ehConversao = Array.isArray(equipasFixas)

  // Jogo já publicado que não fomos nós a publicar agora: a base recusa gravar
  // escalação fora de DRAFT, por isso não vale a pena deixar sortear.
  const bloqueado = publicado && !acabouDePublicar

  const porId = useMemo(() => new Map(jogadores.map((j) => [j.id, j])), [jogadores])

  // ---------- resenha do sorteio (vai no post do feed) ----------
  const [resenha, setResenha] = useState('')
  const sequencias = useMemo(() => calcularSequencias(matches), [matches])
  const liderancas = useMemo(() => calcularLiderancas({ jogadores }), [jogadores])
  // o "jogo" que o gerador vê, montado a partir do sorteio no ecrã
  const jogoParaResenha = useMemo(() => {
    if (!resultado) return null
    const lineup = []
    for (const team of ['A', 'B']) {
      const equipa = team === 'A' ? resultado.teamA : resultado.teamB
      for (const j of equipa.jogadores) {
        lineup.push({ player_id: j.id, name: j.name, team, is_goalkeeper: !!j.isGoalkeeper })
      }
    }
    return {
      id: jogo?.id || 'rascunho',
      kickoff_at: jogo?.kickoff_at,
      team_a_overall: Math.round(resultado.teamA.strength),
      team_b_overall: Math.round(resultado.teamB.strength),
      lineup,
    }
  }, [resultado, jogo])
  // Quem foi à baliza sem ser goleiro: numa conversão saiu à sorte, e o
  // admin tem de o saber para poder trocar antes de publicar. Fica de fora
  // do `outOfPosition` do motor de propósito (ali só entra quem foi
  // empurrado para um lugar de CAMPO), por isso conta-se aqui.
  const improvisados = useMemo(() => {
    if (!ehConversao || !resultado) return []
    return [resultado.teamA?.goalkeeper, resultado.teamB?.goalkeeper]
      .filter((g) => g && g.playerType !== PLAYER_TYPE.GOALKEEPER && g.primaryPosition !== 'GK')
      .map((g) => g.name)
  }, [ehConversao, resultado])

  const gerarResenha = useCallback(
    (tentativa) =>
      jogoParaResenha
        ? gerarResenhaSorteio({ jogo: jogoParaResenha, sequencias, liderancas, tentativa })
        : [],
    [jogoParaResenha, sequencias, liderancas]
  )

  const carregarProximos = useCallback(
    () =>
      adminMatchesUpcoming(pw)
        .then((l) => {
          // Desde a 0019 a agenda também traz jogos à espera de resultado e
          // cancelados (para a aba "Jogos"). Aqui só interessam os que ainda
          // se marcam ou sorteiam.
          setProximos((l || []).filter((m) => ['DRAFT', 'PUBLISHED', 'IN_PROGRESS'].includes(m.status)))
          setFaltaMigracao(false)
        })
        .catch((e) => {
          setFaltaMigracao(true)
          setErro(e.message)
        }),
    [pw]
  )

  useEffect(() => {
    carregarProximos()
  }, [carregarProximos])

  // ---------- passo 1 ----------
  const guardarInfo = async () => {
    if (!quando) return setErro('Escolhe a data e a hora do jogo.')
    setBusy(true)
    setErro('')
    try {
      const id = await adminSaveSchedule(pw, jogo?.id || null, {
        kickoffAt: paraISO(quando),
        location: local,
        mapUrl: mapa,
      })
      setJogo({ id, kickoff_at: paraISO(quando), location: local, map_url: mapa, status: 'DRAFT' })
      await carregarProximos()
      // Numa conversão não há goleiros nem plantel a escolher: distribuem-se
      // as posições com o id do jogo já na semente e vai-se direto rever.
      if (ehConversao) {
        const r = escalarEquipasFixas({
          equipas: equipasFixas.map((ids) => ids.map((x) => porId.get(x))),
          seed: String(id),
        })
        setTentativa(1)
        setResultado(r)
        setSelecao(null)
        setAjustado(false)
        setPasso(6)
        return
      }
      setPasso(2)
    } catch (e) {
      setErro(e.detalhe || e.message)
    } finally {
      setBusy(false)
    }
  }

  const retomar = (m) => {
    // Mudar de jogo tem de limpar as escolhas do anterior: um goleiro marcado
    // para o jogo A não tem nada que aparecer marcado no jogo B. Se o jogo já
    // tiver escalação gravada, é dela que vêm as escolhas.
    if (m.id !== jogo?.id) {
      const linhas = (Array.isArray(m.lineup) ? m.lineup : []).filter((l) =>
        porId.has(l.player_id)
      )
      setGoleiros(linhas.filter((l) => l.is_goalkeeper).map((l) => l.player_id))
      setCampo(linhas.filter((l) => !l.is_goalkeeper).map((l) => l.player_id))
      setTornarGkPermanente({})
      setTentativa(0)
    }
    setJogo(m)
    setQuando(paraLocal(m.kickoff_at))
    setLocal(m.location || '')
    setMapa(m.map_url || '')
    setResultado(null)
    setSelecao(null)
    setAjustado(false)
    setPublicado(m.status !== 'DRAFT')
    setAcabouDePublicar(false)
    setErro('')
    setPasso(2)
  }

  const recomecar = () => {
    setJogo(null)
    setQuando('')
    setLocal('Browns Sports Resort')
    setMapa('')
    setGoleiros([])
    setCampo([])
    setTornarGkPermanente({})
    setResultado(null)
    setSelecao(null)
    setAjustado(false)
    setTentativa(0)
    setPublicado(false)
    setAcabouDePublicar(false)
    setAviso('')
    setErro('')
    setPasso(1)
  }

  // ---------- passos 2/3 ----------
  const alternar = (lista, setLista, id, max) => {
    setErro('')
    if (lista.includes(id)) setLista(lista.filter((x) => x !== id))
    else if (lista.length < max) setLista([...lista, id])
    else setErro(`Já escolheste ${max} — desmarca um antes de escolher outro.`)
  }

  // Quem vai para a baliza sai da lista de campo. Sem isto ficava nos dois
  // sítios: o passo 4 acusava o duplicado e o passo 3 já não deixava desmarcá-lo
  // (a lista de campo esconde os goleiros), e o admin ficava sem saída óbvia.
  const alternarGoleiro = (id) => {
    if (!goleiros.includes(id) && goleiros.length < N_GOLEIROS) {
      setCampo((c) => c.filter((x) => x !== id))
    }
    alternar(goleiros, setGoleiros, id, N_GOLEIROS)
  }

  const goleirosSugeridos = useMemo(
    () => jogadores.filter((j) => j.playerType === PLAYER_TYPE.GOALKEEPER || j.primaryPosition === 'GK'),
    [jogadores]
  )
  const restantes = useMemo(
    () => jogadores.filter((j) => !goleiros.includes(j.id)),
    [jogadores, goleiros]
  )

  // ---------- passo 4: o que está mal antes de sortear ----------
  const escolhidos = useMemo(
    () => [...goleiros, ...campo].map((id) => porId.get(id)).filter(Boolean),
    [goleiros, campo, porId]
  )

  const problemas = useMemo(() => {
    const p = []
    if (goleiros.length !== N_GOLEIROS)
      p.push({
        tom: 'erro',
        texto: `Faltam goleiros: escolhidos ${goleiros.length} de ${N_GOLEIROS}.`,
      })
    if (campo.length !== N_CAMPO)
      p.push({
        tom: 'erro',
        texto:
          campo.length < N_CAMPO
            ? `Faltam ${N_CAMPO - campo.length} jogadores de campo (tens ${campo.length} de ${N_CAMPO}).`
            : `Tens ${campo.length} jogadores de campo — são ${campo.length - N_CAMPO} a mais.`,
      })
    const duplicados = goleiros.filter((id) => campo.includes(id))
    if (duplicados.length)
      p.push({
        tom: 'erro',
        texto: `O mesmo jogador está como goleiro e como jogador de campo: ${duplicados
          .map((id) => porId.get(id)?.name)
          .join(', ')}.`,
      })

    const semPosicao = campo.map((id) => porId.get(id)).filter((j) => j && !j.primaryPosition)
    if (semPosicao.length)
      p.push({
        tom: 'aviso',
        texto: `Sem posição definida: ${semPosicao
          .map((j) => j.name)
          .join(', ')}. O sorteio consegue colocá-los, mas ao calhas — pede-lhes que escolham, ou define tu em “Posições”.`,
      })

    const semOverall = escolhidos.filter((j) => j.overall == null)
    if (semOverall.length)
      p.push({
        tom: 'aviso',
        texto: `Sem overall calculado (entram com 50, neutro): ${semOverall
          .map((j) => j.name)
          .join(', ')}.`,
      })

    const gkDeCampo = goleiros
      .map((id) => porId.get(id))
      .filter((j) => j && j.playerType !== PLAYER_TYPE.GOALKEEPER)
    if (gkDeCampo.length)
      p.push({
        tom: 'aviso',
        texto: `Estão registados como jogadores de campo: ${gkDeCampo
          .map((j) => j.name)
          .join(', ')}. Vão à baliza só neste jogo, a não ser que marques “goleiro permanente”.`,
      })

    // cobertura das posições: com 12 jogadores para 6 lugares x2, se ninguém
    // joga a ala esquerda alguém vai ter de lá ir à força
    const contagem = {}
    for (const id of campo) {
      const j = porId.get(id)
      if (j?.primaryPosition) contagem[j.primaryPosition] = (contagem[j.primaryPosition] || 0) + 1
    }
    const descobertas = FIELD_SLOTS.filter((s) => !contagem[s])
    if (descobertas.length && campo.length === N_CAMPO)
      p.push({
        tom: 'aviso',
        texto: `Ninguém tem como principal: ${descobertas
          .map((s) => nomeDaPosicao(s))
          .join(', ')}. Alguém vai jogar fora da sua posição.`,
      })

    return p
  }, [goleiros, campo, porId, escolhidos])

  const podeSortear = !problemas.some((p) => p.tom === 'erro')

  // ---------- passo 5: sortear ----------
  const sortear = () => {
    if (busy || bloqueado) return
    if (!ehConversao && !podeSortear) return
    if (
      ajustado &&
      !window.confirm(
        ehConversao
          ? 'Distribuir as posições de novo apaga as trocas que fizeste à mão. Continuar?'
          : 'Sortear de novo apaga as trocas que fizeste à mão. Continuar?'
      )
    )
      return
    setBusy(true)
    setErro('')
    try {
      // A semente vem do ID do jogo, para o sorteio ser reproduzível: correr
      // outra vez com a mesma semente dá exactamente as mesmas equipas (é ela
      // que fica gravada em `matches.draw_seed` com a escalação). Como
      // "sortear de novo" tem de dar outro resultado, a tentativa entra na
      // semente — muda o sorteio sem trocar a reprodutibilidade por um
      // relógio, que dava uma semente diferente até no primeiro sorteio.
      const base = jogo?.id || 'rascunho'
      const seed = tentativa === 0 ? String(base) : `${base}#${tentativa}`
      // Numa conversão as equipas vêm fechadas do rachão: só se distribuem
      // as posições dentro de cada uma. Nada de re-sortear quem joga com quem.
      const r = ehConversao
        ? escalarEquipasFixas({
            equipas: equipasFixas.map((ids) => ids.map((id) => porId.get(id))),
            seed,
          })
        : sortearEquipas({
            goalkeepers: goleiros.map((id) => porId.get(id)),
            fieldPlayers: campo.map((id) => porId.get(id)),
            seed,
          })
      setTentativa(tentativa + 1)
      setResultado(r)
      setSelecao(null)
      setAjustado(false)
      setPasso(6)
    } catch (e) {
      setErro(
        e.message === 'GOLEIROS' || e.message === 'CAMPO' || e.message === 'EQUIPAS'
          ? `${e.detalhe || 'Número de jogadores errado.'}`
          : e.detalhe || e.message
      )
    } finally {
      setBusy(false)
    }
  }

  // troca manual: clicar num jogador e depois noutro
  const clicarJogador = (j) => {
    if (!resultado) return
    if (!selecao) return setSelecao(j.id)
    if (selecao === j.id) return setSelecao(null)
    try {
      setResultado(trocarJogadores(resultado, selecao, j.id))
      setAjustado(true)
      setAviso('Troca feita — forças e equilíbrio recalculados.')
      setTimeout(() => setAviso(''), 2500)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSelecao(null)
    }
  }

  const mudarSlot = (playerId, team, slot) => {
    try {
      setResultado(moverParaSlot(resultado, playerId, team, slot))
      setAjustado(true)
    } catch (e) {
      setErro(e.message)
    }
  }

  // ---------- passo 7: publicar ----------
  const publicar = async () => {
    // dupla proteção: a ref fecha a porta antes do próximo render
    if (publicandoRef.current || publicado || !resultado || !jogo) return
    if (
      !window.confirm(
        'Publicar o sorteio? As equipas ficam fixas e aparecem já na página inicial de todos os jogadores.'
      )
    )
      return
    publicandoRef.current = true
    setBusy(true)
    setErro('')
    try {
      await adminSaveLineup(pw, jogo.id, {
        lineup: paraLinhasDeEscalacao(resultado),
        teamAOverall: Math.round(resultado.teamA.strength),
        teamBOverall: Math.round(resultado.teamB.strength),
        balancePct: Number(resultado.balancePct.toFixed(2)),
        seed: resultado.seed,
      })

      // Goleiros que o admin quis fixar como permanentes. É um extra à margem
      // do jogo: se falhar (a migração 0015 por aplicar, por exemplo) não pode
      // levar a publicação atrás — a escalação já está gravada e o grupo está
      // à espera das equipas. Falha em silêncio não, fica no aviso do fim.
      const falhados = []
      for (const id of goleiros) {
        if (!tornarGkPermanente[id]) continue
        const j = porId.get(id)
        if (!j || j.playerType === PLAYER_TYPE.GOALKEEPER) continue
        try {
          await adminSetPositions(pw, id, {
            playerType: PLAYER_TYPE.GOALKEEPER,
            primary: 'GK',
            secondary: j.secondaryPosition,
            acceptsOther: j.acceptsOther,
            reason: 'Definido como goleiro permanente na criação do jogo.',
          })
        } catch {
          falhados.push(j.name)
        }
      }

      await adminPublishMatch(pw, jogo.id, resenha)
      setPublicado(true)
      setAcabouDePublicar(true)
      if (falhados.length)
        setErro(
          `Sorteio publicado. Só não consegui marcar como goleiro permanente: ${falhados.join(
            ', '
          )} — faz isso na aba “Posições”.`
        )
      // A partir daqui o jogo já está publicado: um erro a recarregar listas
      // não desfaz nada e não pode reabrir o botão de publicar.
      await carregarProximos()
      try {
        await onDadosAlterados?.()
      } catch (e2) {
        console.error('Falha a recarregar os dados depois de publicar:', e2)
      }
    } catch (e) {
      setErro(e.message)
      publicandoRef.current = false
    } finally {
      setBusy(false)
    }
  }

  const irPara = (n) => {
    setErro('')
    setPasso(n)
  }

  // ---------- render ----------
  const botoes = (anterior, seguinte, seguinteLabel = 'Continuar', podeSeguir = true) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
      {anterior && (
        <button
          type="button"
          onClick={() => irPara(anterior)}
          style={{ ...styles.buttonGhost, flex: '1 1 120px', width: 'auto' }}
        >
          ← Voltar
        </button>
      )}
      {seguinte && (
        <button
          type="button"
          onClick={() => irPara(seguinte)}
          disabled={!podeSeguir}
          style={
            podeSeguir
              ? { ...styles.button, flex: '2 1 180px', width: 'auto' }
              : disabled({ ...styles.button, flex: '2 1 180px', width: 'auto' })
          }
        >
          {seguinteLabel}
        </button>
      )}
    </div>
  )

  return (
    <div>
      <Progresso passo={passo} conversao={ehConversao} />

      {faltaMigracao ? (
        <div style={{ ...styles.panel, marginBottom: 12 }}>
          <p style={{ ...styles.mutedText, fontSize: 13 }}>
            ⚠️ Não consegui carregar os jogos marcados ({erro}). Se ainda não aplicaste a migração{' '}
            <strong>0016_jogos_agendados.sql</strong> no Supabase, é isso que falta.
          </p>
        </div>
      ) : (
        erro && <ErrorBox style={{ marginBottom: 12 }}>{erro}</ErrorBox>
      )}

      {bloqueado && passo > 1 && (
        <Aviso tom="erro">
          Este jogo já está publicado — as equipas ficaram fixas e não são recalculadas. Para
          equipas novas, marca um jogo novo no passo 1.
        </Aviso>
      )}

      {aviso && (
        <p style={{ color: colors.grass, fontSize: 13, marginBottom: 10 }} role="status">
          {aviso}
        </p>
      )}

      {/* ---------- 1. informações ---------- */}
      {passo === 1 && (
        <div className="pb-card">
          {ehConversao && (
            <Aviso tom="ok">
              As duas equipas do rachão ({equipasFixas[0].length} + {equipasFixas[1].length}{' '}
              jogadores) vêm tal como estão. Só falta a data — os goleiros e as posições são
              tratados a seguir, sem voltar a escolher ninguém.
            </Aviso>
          )}
          <label style={styles.label} htmlFor="quando">
            Data e hora do jogo *
          </label>
          <input
            id="quando"
            type="datetime-local"
            style={{ ...styles.input, marginBottom: 14 }}
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
          {quando && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: -8, marginBottom: 14 }}>
              {(() => {
                const d = formatarDataDoJogo(paraISO(quando))
                return d ? `${d.diaDaSemana}, ${d.data} às ${d.hora} (hora de Lisboa)` : ''
              })()}
            </p>
          )}

          <label style={styles.label} htmlFor="local">
            Local
          </label>
          <input
            id="local"
            style={{ ...styles.input, marginBottom: 14 }}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Browns Sports Resort"
          />

          <label style={styles.label} htmlFor="mapa">
            Link do mapa (opcional)
          </label>
          <input
            id="mapa"
            style={styles.input}
            value={mapa}
            onChange={(e) => setMapa(e.target.value)}
            placeholder="https://maps.app.goo.gl/…"
            inputMode="url"
          />

          <button
            type="button"
            onClick={guardarInfo}
            disabled={busy || !quando}
            style={
              busy || !quando
                ? disabled({ ...styles.button, marginTop: 16 })
                : { ...styles.button, marginTop: 16 }
            }
          >
            {busy
              ? 'A guardar…'
              : ehConversao
                ? '⚽ Escalar as equipas do rachão'
                : jogo
                  ? 'Guardar alterações e continuar'
                  : 'Criar rascunho e continuar'}
          </button>

          {proximos.length > 0 && (
            <div style={{ marginTop: 20, borderTop: `1px solid ${colors.line}`, paddingTop: 14 }}>
              <div style={{ ...styles.label, marginBottom: 8 }}>Jogos já marcados</div>
              <div className="pb-stack" style={{ gap: 8 }}>
                {proximos.map((m) => {
                  const d = formatarDataDoJogo(m.kickoff_at)
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 10,
                        borderRadius: 10,
                        background: '#0C1915',
                        border: `1px solid ${colors.line}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pb-truncate" style={{ fontSize: 14 }}>
                          {d ? `${d.data} · ${d.hora}` : 'sem data'} — {m.location || 'sem local'}
                        </div>
                        <span
                          style={chip(
                            m.status === 'DRAFT' ? colors.teamA : colors.grass,
                            m.status === 'DRAFT'
                              ? 'rgba(255,197,49,0.12)'
                              : 'rgba(52,208,88,0.12)'
                          )}
                        >
                          {/* só o rascunho é que ainda se sorteia: um jogo a
                              decorrer não pode aparecer como "rascunho" */}
                          {m.status === 'DRAFT'
                            ? 'rascunho'
                            : m.status === 'IN_PROGRESS'
                              ? 'a decorrer'
                              : 'publicado'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => retomar(m)}
                        style={{ ...styles.link, color: colors.teamA, flexShrink: 0 }}
                      >
                        Retomar
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- 2. goleiros ---------- */}
      {passo === 2 && (
        <div className="pb-card">
          <p style={{ fontSize: 14, marginBottom: 4 }}>
            Escolhe os <strong>{N_GOLEIROS} goleiros</strong> ({goleiros.length} escolhidos). Vão um
            para cada equipa, antes de distribuir o campo.
          </p>
          {goleirosSugeridos.length > 0 && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
              Registados como goleiros: {goleirosSugeridos.map((g) => g.name).join(', ')}.
            </p>
          )}

          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {jogadores.map((j) => (
              <LinhaJogador
                key={j.id}
                j={j}
                marcado={goleiros.includes(j.id)}
                onToggle={() => alternarGoleiro(j.id)}
                desativado={!goleiros.includes(j.id) && goleiros.length >= N_GOLEIROS}
                extra={
                  goleiros.includes(j.id) && j.playerType !== PLAYER_TYPE.GOALKEEPER ? (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11,
                        color: colors.teamA,
                        flexShrink: 0,
                        maxWidth: 108,
                      }}
                      title="Passa a contar como goleiro em todos os jogos e no ranking de goleiros"
                    >
                      <input
                        type="checkbox"
                        checked={!!tornarGkPermanente[j.id]}
                        onChange={(e) =>
                          setTornarGkPermanente({ ...tornarGkPermanente, [j.id]: e.target.checked })
                        }
                        style={{ width: 14, height: 14, accentColor: colors.teamA }}
                      />
                      goleiro fixo
                    </label>
                  ) : null
                }
              />
            ))}
          </div>

          {goleiros.length !== N_GOLEIROS && (
            <Aviso tom="erro">
              Escolhidos {goleiros.length} de {N_GOLEIROS} goleiros.
            </Aviso>
          )}

          {botoes(1, 3, 'Continuar', goleiros.length === N_GOLEIROS)}
        </div>
      )}

      {/* ---------- 3. jogadores de campo ---------- */}
      {passo === 3 && (
        <div className="pb-card">
          <p style={{ fontSize: 14, marginBottom: 10 }}>
            Marca os <strong>{N_CAMPO} jogadores de campo</strong> ({campo.length} marcados). Os
            goleiros já saíram desta lista.
          </p>

          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {restantes.map((j) => (
              <LinhaJogador
                key={j.id}
                j={j}
                marcado={campo.includes(j.id)}
                onToggle={() => alternar(campo, setCampo, j.id, N_CAMPO)}
                desativado={!campo.includes(j.id) && campo.length >= N_CAMPO}
              />
            ))}
          </div>

          {campo.length !== N_CAMPO && (
            <Aviso tom="erro">
              {campo.length < N_CAMPO
                ? `Faltam ${N_CAMPO - campo.length}.`
                : `São ${campo.length - N_CAMPO} a mais.`}{' '}
              O sorteio 2-3-1 precisa de exatamente {N_CAMPO}.
            </Aviso>
          )}

          {botoes(2, 4, 'Continuar', campo.length === N_CAMPO)}
        </div>
      )}

      {/* ---------- 4. verificar posições ---------- */}
      {passo === 4 && (
        <div className="pb-card">
          <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 10 }}>
            Verificação antes de sortear
          </div>

          {problemas.length === 0 ? (
            <Aviso tom="ok">Está tudo pronto: {N_GOLEIROS} goleiros, {N_CAMPO} de campo, todos com posição e overall.</Aviso>
          ) : (
            problemas.map((p, i) => (
              <Aviso key={i} tom={p.tom}>
                {p.texto}
              </Aviso>
            ))
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ ...styles.label, marginBottom: 8 }}>
              Quem vai jogar ({escolhidos.length})
            </div>
            <div className="pb-cards" style={{ gap: 8 }}>
              {escolhidos.map((j) => {
                const e = ETIQUETA_STATUS[j.positionStatus] || ETIQUETA_STATUS.NOT_SELECTED
                const tomCor =
                  j.positionStatus === POSITION_STATUS.NOT_SELECTED
                    ? colors.teamA
                    : j.positionStatus === POSITION_STATUS.APPROVED
                      ? colors.grass
                      : j.positionStatus === POSITION_STATUS.ADJUSTED_BY_ADMIN
                        ? colors.teamB
                        : colors.muted
                return (
                  <div
                    key={j.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 8,
                      borderRadius: 10,
                      background: '#0C1915',
                      border: `1px solid ${colors.line}`,
                    }}
                  >
                    <Avatar name={j.name} photo={j.photo} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pb-truncate" style={{ fontSize: 13 }}>
                        {j.name}
                      </div>
                      <span style={chip(tomCor)}>
                        <span aria-hidden>{e.icone}</span>
                        {goleiros.includes(j.id) ? 'Goleiro neste jogo' : e.texto}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        flexShrink: 0,
                        fontFamily: fonts.title,
                      }}
                    >
                      {j.primaryPosition ? siglaDaPosicao(j.primaryPosition) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {botoes(3, 5, 'Ir para o sorteio', podeSortear)}
        </div>
      )}

      {/* ---------- 5. sortear ---------- */}
      {passo === 5 && (
        <div className="pb-card">
          <p style={{ fontSize: 14, marginBottom: 12 }}>
            O sorteio testa todas as divisões possíveis das duas equipas e escolhe a que junta
            forças parecidas com o menor número de jogadores fora da sua posição.
          </p>
          <button
            type="button"
            onClick={sortear}
            disabled={busy || !podeSortear || bloqueado}
            style={busy || !podeSortear || bloqueado ? disabled(styles.button) : styles.button}
          >
            {busy ? 'A calcular…' : '🎲 Sortear equipas'}
          </button>
          {!podeSortear && !bloqueado && (
            <Aviso tom="erro">Há problemas por resolver no passo 4.</Aviso>
          )}
          {botoes(4, null)}
        </div>
      )}

      {/* ---------- 6. rever ---------- */}
      {passo === 6 && resultado && (
        <div className="pb-stack">
          {ehConversao && (
            <Aviso tom="ok">
              Equipas vindas do <strong>sorteio rápido</strong> — ficaram como estavam. Só as
              posições foram distribuídas: quem tem posição definida ficou nela sempre que deu, e
              quem sobrou ocupou o resto.
              {improvisados.length > 0 && (
                <>
                  {' '}
                  <strong>
                    {improvisados.join(' e ')} {improvisados.length === 1 ? 'vai' : 'vão'} à baliza
                  </strong>{' '}
                  sem ser goleiro{improvisados.length === 1 ? '' : 's'} — saiu à sorte, porque
                  ninguém nesse time está registado como tal. Troca à mão se houver melhor
                  candidato.
                </>
              )}{' '}
              Ajusta o que quiseres aqui antes de publicar.
            </Aviso>
          )}
          <div className="pb-card" style={{ padding: 12 }}>
            <FootballPitch
              teamA={{ ...resultado.teamA, nome: '⚫ Pretos', cor: '#8A96A0' }}
              teamB={{ ...resultado.teamB, nome: '⚪ Brancos', cor: '#F2F5F2' }}
              showOverall
              interactive
              onPlayerClick={clicarJogador}
              destaqueIds={selecao ? [selecao] : []}
            />
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
              {selecao
                ? 'Agora toca noutro jogador para trocar os dois.'
                : 'Toca num jogador e depois noutro para os trocar.'}
            </p>
          </div>

          {/* números do equilíbrio */}
          <div className="pb-card">
            <div className="pb-cards" style={{ gap: 10 }}>
              <Numero rotulo="⚫ Pretos" valor={Math.round(resultado.teamA.strength)} cor="#8A96A0" />
              <Numero rotulo="⚪ Brancos" valor={Math.round(resultado.teamB.strength)} cor="#F2F5F2" />
              <Numero rotulo="Diferença" valor={Math.round(resultado.diff)} cor={colors.muted} />
              <Numero
                rotulo="Média Pretos"
                valor={resultado.teamA.avg.toFixed(1)}
                cor={colors.muted}
              />
              <Numero
                rotulo="Média Brancos"
                valor={resultado.teamB.avg.toFixed(1)}
                cor={colors.muted}
              />
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <span
                style={chip(
                  NIVEL_COR[resultado.balanceLevel] || colors.muted,
                  `${NIVEL_COR[resultado.balanceLevel] || colors.muted}1A`
                )}
              >
                ⚖️ Equilíbrio: {resultado.balanceLabel} · {resultado.balancePct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* fora de posição */}
          <div className="pb-card">
            <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, marginBottom: 8 }}>
              Fora da posição principal ({resultado.outOfPosition.length})
            </div>
            {resultado.outOfPosition.length === 0 ? (
              <p style={{ color: colors.grass, fontSize: 14 }}>
                🎉 Toda a gente ficou na sua posição principal.
              </p>
            ) : (
              <div className="pb-stack" style={{ gap: 8 }}>
                {resultado.outOfPosition.map((o) => (
                  <div
                    key={o.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                      padding: '6px 0',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="pb-truncate" style={{ display: 'block', fontWeight: 600 }}>
                        {o.name}
                      </span>
                      <span style={{ color: colors.muted, fontSize: 12 }}>
                        joga {nomeDaPosicao(o.assigned)}
                        {o.preferred ? ` · prefere ${nomeDaPosicao(o.preferred)}` : ''}
                      </span>
                    </span>
                    <span style={chip(colors.teamA)}>{o.motivo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ajuste manual acessível por botões, não só por arrastar */}
          <details className="pb-card">
            <summary style={{ cursor: 'pointer', fontSize: 14 }}>
              Ajustar posições sem arrastar
            </summary>
            <p style={{ ...styles.mutedText, fontSize: 12, margin: '8px 0 10px' }}>
              Escolhe um jogador e o lugar para onde vai. Quem estiver lá troca com ele — mais
              ninguém muda.
            </p>
            {['A', 'B'].map((lado) => {
              const equipa = lado === 'A' ? resultado.teamA : resultado.teamB
              return (
                <div key={lado} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>
                    {lado === 'A' ? '⚫ Pretos' : '⚪ Brancos'}
                  </div>
                  {FIELD_SLOTS.map((slot) => {
                    const j = equipa.slots?.[slot]
                    if (!j) return null
                    return (
                      <div
                        key={slot}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '5px 0',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          className="pb-truncate"
                          style={{ flex: '1 1 110px', fontSize: 13, minWidth: 0 }}
                        >
                          {j.name}
                        </span>
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                        >
                          <span style={{ fontSize: 11, color: colors.muted }}>lugar</span>
                          <select
                            value={slot}
                            onChange={(e) => mudarSlot(j.id, lado, e.target.value)}
                            aria-label={`Lugar de ${j.name}`}
                            style={{
                              ...styles.input,
                              width: 'auto',
                              padding: '7px 9px',
                              fontSize: 13,
                            }}
                          >
                            {FIELD_SLOTS.map((s) => (
                              <option key={s} value={s}>
                                {nomeDaPosicao(s)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </details>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={sortear}
              disabled={busy || bloqueado}
              style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
            >
              {ehConversao ? '🔄 Distribuir posições de novo' : '🔄 Sortear de novo'}
            </button>
            <button
              type="button"
              onClick={() => irPara(7)}
              style={{ ...styles.button, flex: '2 1 180px', width: 'auto' }}
            >
              Continuar para publicar
            </button>
          </div>
          {botoes(ehConversao ? 1 : 5, null)}
        </div>
      )}

      {passo === 6 && !resultado && (
        <div className="pb-card">
          <p style={styles.mutedText}>Ainda não há sorteio. Volta ao passo 5.</p>
          {botoes(ehConversao ? 1 : 5, null)}
        </div>
      )}

      {/* ---------- 7. publicar ---------- */}
      {passo === 7 && (
        <div className="pb-card">
          {!resultado ? (
            <>
              <p style={styles.mutedText}>Falta sortear as equipas.</p>
              {botoes(ehConversao ? 1 : 5, null)}
            </>
          ) : acabouDePublicar ? (
            <>
              <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
                <div style={{ fontSize: 34 }} aria-hidden>
                  ✅
                </div>
                <div style={{ ...styles.title, fontSize: 19, marginTop: 6 }}>Sorteio publicado</div>
                <p style={{ ...styles.mutedText, marginTop: 8, fontSize: 14 }}>
                  Já aparece na página inicial de todos os jogadores, com a contagem regressiva.
                </p>
              </div>
              <button type="button" onClick={recomecar} style={{ ...styles.buttonGhost, marginTop: 14 }}>
                Marcar outro jogo
              </button>
            </>
          ) : publicado ? (
            <>
              <Aviso tom="erro">
                Este jogo já tinha sido publicado. O sorteio que está aqui no ecrã <strong>não foi
                gravado</strong> e os jogadores continuam a ver as equipas publicadas na altura —
                publicar é definitivo, de propósito.
              </Aviso>
              <button type="button" onClick={recomecar} style={{ ...styles.buttonGhost, marginTop: 14 }}>
                Marcar outro jogo
              </button>
              {botoes(6, null)}
            </>
          ) : (
            <>
              <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 16, marginBottom: 10 }}>
                Confirmar publicação
              </div>
              <div className="pb-stack" style={{ gap: 6, fontSize: 14 }}>
                <Resumo
                  rotulo="Quando"
                  valor={(() => {
                    const d = formatarDataDoJogo(jogo?.kickoff_at)
                    return d ? `${d.diaDaSemana}, ${d.data} às ${d.hora}` : '—'
                  })()}
                />
                <Resumo rotulo="Onde" valor={jogo?.location || '—'} />
                <Resumo rotulo="⚫ Pretos" valor={Math.round(resultado.teamA.strength)} />
                <Resumo rotulo="⚪ Brancos" valor={Math.round(resultado.teamB.strength)} />
                <Resumo rotulo="Diferença" valor={Math.round(resultado.diff)} />
                <Resumo
                  rotulo="Equilíbrio"
                  valor={`${resultado.balanceLabel} (${resultado.balancePct.toFixed(1)}%)`}
                />
                <Resumo rotulo="Fora de posição" valor={`${resultado.outOfPosition.length} jogadores`} />
              </div>

              <div style={{ margin: '14px 0', borderTop: `1px solid ${colors.line}`, paddingTop: 14 }}>
                {/* `inicial` devolve o texto guardado quando o admin volta ao
                    passo 6 e regressa — o editor desmonta pelo caminho */}
                <ResenhaEditor gerar={gerarResenha} onChange={setResenha} inicial={resenha} />
              </div>

              <Aviso>
                Depois de publicado, o sorteio não é recalculado. Para mudar as equipas terás de
                marcar um jogo novo. A resenha sai no feed de todos, junto com as equipas.
              </Aviso>

              <button
                type="button"
                onClick={publicar}
                disabled={busy || publicado}
                style={
                  busy || publicado
                    ? disabled({ ...styles.button, marginTop: 14 })
                    : { ...styles.button, marginTop: 14 }
                }
              >
                {busy ? 'A publicar…' : '📢 Publicar sorteio'}
              </button>
              {botoes(6, null)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, cor }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.5 }}>{rotulo}</div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 24,
          fontWeight: 700,
          color: cor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
    </div>
  )
}

function Resumo({ rotulo, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: colors.muted }}>{rotulo}</span>
      <span className="pb-truncate" style={{ fontWeight: 700, textAlign: 'right' }}>
        {valor}
      </span>
    </div>
  )
}
