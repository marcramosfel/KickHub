import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminMatchesUpcoming,
  adminPublishMatch,
  adminSaveForecast,
  adminSaveLineup,
  adminSaveSchedule,
  adminSetPositions,
  getMatch,
} from '../../api'
import {
  definirInicioNoGol,
  escalarEquipasFixas,
  historicoDeGol,
  moverParaSlot,
  paraLinhasDeEscalacao,
  sortearEquipas,
  sortearEquipasRotativo,
  trocarJogadores,
  N_GOLEIROS,
} from '../../lib/drawEngine'
import { GK_MODE, elencoNecessario, formacaoDe, lugaresDe } from '../../lib/formacoes'
import {
  contarDisponiveis,
  estadoVisivel,
  etiquetaDoEstado,
  indiceDeRespostas,
  separarMensalistas,
} from '../../lib/plantel'
import { ETIQUETA_STATUS, nomeDaPosicao, PLAYER_TYPE } from '../../lib/positions'
import { formatarDataDoJogo } from '../../lib/countdown'
import { calcularLiderancas } from '../../lib/achievements'
import { calcularSequencias } from '../../lib/streaks'
import { gerarResenhaSorteio } from '../../lib/resenha'
import { copiarTexto, partilharTexto, resumoSorteio } from '../../lib/share'
import { preverJogo } from '../../lib/previsao'
import Avatar from '../Avatar'
import FootballPitch from '../FootballPitch'
import FormatoPicker from './FormatoPicker'
import RodizioPanel from './RodizioPanel'
import ResenhaEditor from './ResenhaEditor'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// Criação de um jogo, passo a passo.
//
// Eram SETE passos para três decisões reais. O passo 4 (verificar posições)
// era só um ecrã de avisos e o passo 5 era um botão sozinho a ocupar um ecrã
// inteiro. Ficam quatro:
//
//   1. O jogo      — quando, onde e em que FORMATO (a decisão que faltava)
//   2. Quem joga   — uma lista só, com os avisos resolvíveis em linha
//   3. Sorteio     — o campo, o equilíbrio, o rodízio e os ajustes à mão
//   4. Publicar    — resumo, resenha e partilha num toque
//
// O formato vem PRIMEIRO de propósito. É ele que decide quantas pessoas são
// precisas e se há goleiros a marcar; escolhê-lo depois obrigava a invalidar
// a seleção já feita e a mostrar erros do género "escolheste 12, agora são
// 14". Assim o passo 2 nasce com o contador certo e o erro é impossível.

const PASSOS = [
  { id: 1, titulo: 'O jogo' },
  { id: 2, titulo: 'Quem joga' },
  { id: 3, titulo: 'Sorteio' },
  { id: 4, titulo: 'Publicar' },
]

// Numa conversão de rachão os passos 2 e 3 quase não existem: as equipas
// vêm feitas e só se distribuem posições. Contar "passo 3 de 4" num fluxo de
// três ecrãs seria mentir ao admin sobre o que falta.
const PASSOS_CONVERSAO = [
  { id: 1, titulo: 'O jogo' },
  { id: 3, titulo: 'Rever escalação' },
  { id: 4, titulo: 'Publicar' },
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

function Aviso({ tom = 'aviso', children, acao }) {
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
      <span style={{ flex: 1 }}>{children}</span>
      {acao}
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
// oficial: as equipas já estão decididas e só se distribuem as posições.
export default function MatchWizard({
  pw,
  jogadores,
  matches,
  conversao,
  convocatoria,
  onDadosAlterados,
}) {
  const [passo, setPasso] = useState(1)
  const [jogo, setJogo] = useState(null) // rascunho guardado no servidor
  const [proximos, setProximos] = useState([])
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  const [faltaMigracao, setFaltaMigracao] = useState(false)

  // passo 1 — quando, onde e formato
  const [quando, setQuando] = useState('')
  const [local, setLocal] = useState('Browns Sports Resort')
  const [mapa, setMapa] = useState('')
  const [gkMode, setGkMode] = useState(GK_MODE.FIXED)
  const [tamanho, setTamanho] = useState(7)
  const [rotacaoMinutos, setRotacaoMinutos] = useState(10)

  // passo 2 — elenco
  const [goleiros, setGoleiros] = useState([])
  const [campo, setCampo] = useState([])
  const [tornarGkPermanente, setTornarGkPermanente] = useState({})

  // passo 3 — sorteio
  const [resultado, setResultado] = useState(null)
  const [selecao, setSelecao] = useState(null) // troca manual: primeiro clique
  const [ajustado, setAjustado] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [publicado, setPublicado] = useState(false)
  const [acabouDePublicar, setAcabouDePublicar] = useState(false)
  const publicandoRef = useRef(false)

  const rotativo = gkMode === GK_MODE.ROTATING
  const elenco = elencoNecessario(tamanho, gkMode)
  const lugares = lugaresDe(tamanho)

  // ---------- conversão de um rachão ----------
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

  // Histórico de baliza: quantas vezes cada um começou no gol e há quanto
  // tempo. É o que torna a escolha JUSTA em vez de aleatória — e vive aqui
  // (fora do render do motor) para o `new Date()` não entrar no sorteio.
  const historico = useMemo(() => historicoDeGol(jogadores), [jogadores])

  // ---------- resenha do sorteio (vai no post do feed) ----------
  const [resenha, setResenha] = useState('')
  const sequencias = useMemo(() => calcularSequencias(matches), [matches])
  const liderancas = useMemo(() => calcularLiderancas({ jogadores }), [jogadores])
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

  // Quem foi à baliza sem ser goleiro. Numa conversão saiu do rodízio; no
  // formato rotativo é o caso normal e não é aviso nenhum.
  const improvisados = useMemo(() => {
    if (rotativo || !ehConversao || !resultado) return []
    return [resultado.teamA?.goalkeeper, resultado.teamB?.goalkeeper]
      .filter((g) => g && g.playerType !== PLAYER_TYPE.GOALKEEPER && g.primaryPosition !== 'GK')
      .map((g) => g.name)
  }, [rotativo, ehConversao, resultado])

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
        gkMode,
        teamSize: tamanho,
        rotationMinutes: rotativo ? rotacaoMinutos : null,
      })
      setJogo({
        id,
        kickoff_at: paraISO(quando),
        location: local,
        map_url: mapa,
        status: 'DRAFT',
        gk_mode: gkMode,
        team_size: tamanho,
        gk_rotation_minutes: rotativo ? rotacaoMinutos : null,
      })
      await carregarProximos()
      if (ehConversao) {
        const r = escalarEquipasFixas({
          equipas: equipasFixas.map((ids) => ids.map((x) => porId.get(x))),
          seed: String(id),
          historicoGol: historico,
        })
        setTentativa(1)
        setResultado(r)
        setSelecao(null)
        setAjustado(false)
        setPasso(3)
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
    // Mudar de jogo tem de limpar as escolhas do anterior — e agora também o
    // FORMATO: retomar um rascunho criado com rodízio e continuar a ver
    // "escolher 2 goleiros" era a forma mais rápida de publicar um jogo
    // diferente do que o admin julgava estar a fazer.
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
    setGkMode(m.gk_mode === GK_MODE.ROTATING ? GK_MODE.ROTATING : GK_MODE.FIXED)
    setTamanho(m.team_size || 7)
    setRotacaoMinutos(m.gk_rotation_minutes ?? 10)
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
    setGkMode(GK_MODE.FIXED)
    setTamanho(7)
    setRotacaoMinutos(10)
    setGoleiros([])
    setCampo([])
    setTornarGkPermanente({})
    setResultado(null)
    setSelecao(null)
    setAjustado(false)
    setTentativa(0)
    setPublicado(false)
    setAcabouDePublicar(false)
    setResenha('')
    setAviso('')
    setErro('')
    setPasso(1)
  }

  // Mudar de formato não pode limpar a seleção em silêncio: mantém-se quem
  // já estava marcado e o contador revalida sozinho.
  const mudarModo = (modo) => {
    if (modo === gkMode) return
    setErro('')
    setResultado(null)
    setAjustado(false)
    setTentativa(0)
    if (modo === GK_MODE.ROTATING) {
      // no rodízio não há goleiros marcados: quem estava na baliza volta
      // para a lista de linha, em vez de desaparecer da seleção
      setCampo((c) => [...new Set([...c, ...goleiros])])
      setGoleiros([])
      setTornarGkPermanente({})
    }
    setGkMode(modo)
  }

  const mudarTamanho = (n) => {
    if (Number(n) === Number(tamanho)) return
    setErro('')
    setResultado(null)
    setAjustado(false)
    setTentativa(0)
    setTamanho(Number(n))
  }

  // ---------- passo 2 ----------
  const alternar = (lista, setLista, id, max) => {
    setErro('')
    if (lista.includes(id)) setLista(lista.filter((x) => x !== id))
    else if (lista.length < max) setLista([...lista, id])
    else setErro(`Já escolheste ${max} — desmarca um antes de escolher outro.`)
  }

  // Quem vai para a baliza sai da lista de campo, senão ficava nos dois
  // sítios e o admin ficava sem saída óbvia.
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
  // Quem já respondeu à convocatória deste jogo (ou do mais próximo).
  const respostas = useMemo(() => indiceDeRespostas(convocatoria), [convocatoria])

  // ---------- pré-escalação com os mensalistas ----------
  //
  // São eles que pagam o mensal e são eles que costumam jogar: começar a
  // rodada com a lista vazia era pedir ao admin que repetisse à mão, todas as
  // semanas, a mesma escolha de catorze nomes.
  //
  // PRÉ-MARCA, não decide: quem entra fica marcado como qualquer outro e
  // desmarca-se com um toque. E salta quem disse que não vai ou está
  // lesionado/a viajar — pré-marcar quem já avisou que falta seria pior do
  // que não pré-marcar ninguém.
  const preEscalar = useCallback(() => {
    const disponivel = (j) =>
      respostas[j.id] !== false && !estadoVisivel(j.availabilityStatus)
    const { mensalistas } = separarMensalistas(jogadores.filter((j) => !goleiros.includes(j.id)))
    const escolhidosAgora = mensalistas.filter(disponivel).slice(0, elenco.campo)
    setCampo(escolhidosAgora.map((j) => j.id))
    return {
      marcados: escolhidosAgora.length,
      // quantos mensalistas ficaram de fora por terem avisado
      forcaDeFora: mensalistas.length - mensalistas.filter(disponivel).length,
      faltam: Math.max(0, elenco.campo - escolhidosAgora.length),
    }
  }, [jogadores, goleiros, respostas, elenco.campo])

  // Corre uma vez por jogo, ao entrar no passo 2 com a lista ainda vazia.
  // `jogoPreEscalado` impede que voltar atrás e avançar outra vez apague as
  // mudanças que o admin já fez à mão.
  //
  // Ajustado DURANTE o render e não num efeito — é o mesmo padrão da
  // `conversaoAplicada` aqui em cima, e pela mesma razão: um efeito só corre
  // depois de pintar, portanto o passo 2 aparecia um instante com a lista
  // vazia antes de os mensalistas saltarem para lá.
  const [jogoPreEscalado, setJogoPreEscalado] = useState(null)
  const [avisoPre, setAvisoPre] = useState(null)
  if (passo === 2 && jogo?.id && jogo.id !== jogoPreEscalado) {
    setJogoPreEscalado(jogo.id)
    // rascunho retomado com gente já escolhida: não se mexe no que lá está
    if (campo.length === 0) {
      const r = preEscalar()
      if (r.marcados > 0) setAvisoPre(r)
    }
  }

  // A lista de escolha em dois blocos: ⭐ mensalistas primeiro, resto do
  // plantel a seguir. É só ORDEM — nenhum jogador fica marcado por isto, e o
  // admin continua a poder chamar quem quiser do segundo bloco.
  const blocos = useMemo(() => {
    const disponiveis = jogadores.filter((j) => !goleiros.includes(j.id))
    const { mensalistas, restantes } = separarMensalistas(disponiveis)
    return [
      { id: 'mensalistas', titulo: '⭐ Mensalistas', lista: mensalistas },
      { id: 'restantes', titulo: 'Restante do plantel', lista: restantes },
    ].filter((b) => b.lista.length > 0)
  }, [jogadores, goleiros])

  const escolhidos = useMemo(
    () => [...goleiros, ...campo].map((id) => porId.get(id)).filter(Boolean),
    [goleiros, campo, porId]
  )

  // ---------- o que está mal antes de sortear ----------
  // Estes avisos eram um passo inteiro (o antigo passo 4, só de leitura).
  // Passam a viver no ecrã da seleção, ao lado do que os resolve.
  const problemas = useMemo(() => {
    const p = []
    if (!rotativo && goleiros.length !== N_GOLEIROS)
      p.push({
        tom: 'erro',
        texto: `Faltam goleiros: escolhidos ${goleiros.length} de ${N_GOLEIROS}.`,
      })
    if (campo.length !== elenco.campo)
      p.push({
        tom: 'erro',
        texto:
          campo.length < elenco.campo
            ? `Faltam ${elenco.campo - campo.length} ${rotativo ? 'jogadores' : 'jogadores de campo'} (tens ${campo.length} de ${elenco.campo}).`
            : `Tens ${campo.length} — são ${campo.length - elenco.campo} a mais.`,
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

    if (!rotativo) {
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
    }

    if (rotativo) {
      const recusam = escolhidos.filter((j) => j.gkRotationOk === false)
      if (recusam.length >= elenco.total)
        p.push({
          tom: 'aviso',
          texto: 'Ninguém neste elenco aceita ir à baliza — a regra vai ser ignorada e o rodízio sai à mesma.',
        })
      else if (recusam.length)
        p.push({
          tom: 'aviso',
          texto: `Não aceitam ir à baliza: ${recusam.map((j) => j.name).join(', ')}. Ficam no fim do rodízio.`,
        })
    }

    // cobertura das posições: se ninguém joga a ala esquerda, alguém vai lá
    // ter de ir à força
    const contagem = {}
    for (const id of campo) {
      const j = porId.get(id)
      if (j?.primaryPosition) contagem[j.primaryPosition] = (contagem[j.primaryPosition] || 0) + 1
    }
    const descobertas = lugares.filter((s) => !contagem[s])
    if (descobertas.length && campo.length === elenco.campo)
      p.push({
        tom: 'aviso',
        texto: `Ninguém tem como principal: ${descobertas
          .map((s) => nomeDaPosicao(s))
          .join(', ')}. Alguém vai jogar fora da sua posição.`,
      })

    return p
  }, [rotativo, goleiros, campo, porId, escolhidos, elenco, lugares])

  const podeSortear = !problemas.some((p) => p.tom === 'erro')

  // ---------- sortear ----------
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
      // A semente vem do ID do jogo, para o sorteio ser reproduzível; a
      // tentativa entra nela para "sortear de novo" dar outro resultado sem
      // trocar a reprodutibilidade por um relógio.
      const base = jogo?.id || 'rascunho'
      const seed = tentativa === 0 ? String(base) : `${base}#${tentativa}`
      const r = ehConversao
        ? escalarEquipasFixas({
            equipas: equipasFixas.map((ids) => ids.map((id) => porId.get(id))),
            seed,
            historicoGol: historico,
          })
        : rotativo
          ? sortearEquipasRotativo({
              jogadores: campo.map((id) => porId.get(id)),
              seed,
              historicoGol: historico,
              tamanho,
              rotacaoMinutos: rotacaoMinutos || null,
            })
          : sortearEquipas({
              goalkeepers: goleiros.map((id) => porId.get(id)),
              fieldPlayers: campo.map((id) => porId.get(id)),
              seed,
              tamanho,
            })
      setTentativa(tentativa + 1)
      setResultado(r)
      setSelecao(null)
      setAjustado(false)
      setPasso(3)
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
      setErro(e.detalhe || e.message)
    } finally {
      setSelecao(null)
    }
  }

  const mudarSlot = (playerId, team, slot) => {
    try {
      setResultado(moverParaSlot(resultado, playerId, team, slot))
      setAjustado(true)
    } catch (e) {
      setErro(e.detalhe || e.message)
    }
  }

  const mudarInicioNoGol = (team, playerId) => {
    try {
      setResultado(definirInicioNoGol(resultado, team, playerId))
      setAjustado(true)
      setAviso('Trocado — as forças das equipas não mudam.')
      setTimeout(() => setAviso(''), 2500)
    } catch (e) {
      setErro(e.detalhe || e.message)
    }
  }

  // ---------- publicar ----------
  const publicar = async () => {
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

      // Goleiros que o admin quis fixar como permanentes. É um extra à
      // margem do jogo: se falhar não pode levar a publicação atrás.
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

      // A previsão da pelada, congelada agora.
      //
      // Depois de publicar e nunca antes: é sobre as equipas que o grupo vai
      // ver, e um sorteio refeito tem de dar outra previsão. Falhar aqui não
      // pode desfazer a publicação — o sorteio já está no ar e uma previsão em
      // falta é uma secção a menos, não um jogo por publicar.
      try {
        const publicado = await getMatch(jogo.id)
        const f = preverJogo({ jogo: publicado, jogadores })
        if (f) await adminSaveForecast(pw, jogo.id, f)
      } catch (e3) {
        console.error('Falha a gravar a previsão da pelada:', e3)
      }

      setPublicado(true)
      setAcabouDePublicar(true)
      if (falhados.length)
        setErro(
          `Sorteio publicado. Só não consegui marcar como goleiro permanente: ${falhados.join(
            ', '
          )} — faz isso na aba “Posições”.`
        )
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

  // O texto do sorteio, pronto a colar no grupo. Publicar e partilhar eram
  // dois ecrãs; agora é o mesmo sítio.
  const partilhar = async (copiarSo = false) => {
    const jogoPartilha = {
      ...jogo,
      gk_mode: gkMode,
      gk_rotation_minutes: rotativo ? rotacaoMinutos : null,
      team_a_overall: resultado ? Math.round(resultado.teamA.strength) : null,
      team_b_overall: resultado ? Math.round(resultado.teamB.strength) : null,
      lineup: resultado
        ? paraLinhasDeEscalacao(resultado).map((l) => ({
            ...l,
            name: porId.get(l.player_id)?.name || '',
          }))
        : [],
    }
    const texto = resumoSorteio(jogoPartilha, resenha)
    const r = copiarSo ? await copiarTexto(texto) : await partilharTexto(texto)
    if (r === 'copiado' || r === 'manual') setAviso('Escalação copiada — cola no grupo.')
    else if (r === 'whatsapp') setAviso('Abri o WhatsApp com a escalação.')
    setTimeout(() => setAviso(''), 3000)
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
            ⚠️ Não consegui carregar os jogos marcados ({erro}). Se ainda não aplicaste as
            migrações <strong>0016</strong> e <strong>0024</strong> no Supabase, é isso que falta.
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

      {/* ---------- 1. o jogo ---------- */}
      {passo === 1 && (
        <div className="pb-card">
          {ehConversao && (
            <Aviso tom="ok">
              As duas equipas do rachão ({equipasFixas[0].length} + {equipasFixas[1].length}{' '}
              jogadores) vêm tal como estão. Só falta a data — as posições são tratadas a seguir,
              sem voltar a escolher ninguém.
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
            style={{ ...styles.input, marginBottom: 18 }}
            value={mapa}
            onChange={(e) => setMapa(e.target.value)}
            placeholder="https://maps.app.goo.gl/…"
            inputMode="url"
          />

          {/* Numa conversão as equipas já estão feitas: o formato não muda
              nada e mostrá-lo só dava a escolher o que não se aplica. */}
          {!ehConversao && (
            <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 16 }}>
              <FormatoPicker
                gkMode={gkMode}
                tamanho={tamanho}
                rotacaoMinutos={rotacaoMinutos}
                onMudarModo={mudarModo}
                onMudarTamanho={mudarTamanho}
                onMudarRotacao={setRotacaoMinutos}
                bloqueado={bloqueado}
              />
            </div>
          )}

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
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                          <span
                            style={chip(
                              m.status === 'DRAFT' ? colors.teamA : colors.grass,
                              m.status === 'DRAFT'
                                ? 'rgba(255,197,49,0.12)'
                                : 'rgba(52,208,88,0.12)'
                            )}
                          >
                            {m.status === 'DRAFT'
                              ? 'rascunho'
                              : m.status === 'IN_PROGRESS'
                                ? 'a decorrer'
                                : 'publicado'}
                          </span>
                          <span style={chip(colors.muted)}>
                            {m.gk_mode === GK_MODE.ROTATING ? '🔄 rodízio' : '🧤 goleiros fixos'} ·{' '}
                            {formacaoDe(m.team_size).rotulo}
                          </span>
                        </div>
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

      {/* ---------- 2. quem joga ---------- */}
      {passo === 2 && (
        <div className="pb-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <span style={chip(colors.grass, 'rgba(52,208,88,0.12)')}>
              {rotativo ? '🔄 Sem goleiros fixos' : '🧤 Com goleiros fixos'} ·{' '}
              {formacaoDe(tamanho).rotulo}
            </span>
            <button type="button" onClick={() => irPara(1)} style={{ ...styles.link }}>
              mudar formato
            </button>
          </div>

          {/* Um contador só, com o número certo para o formato escolhido. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: fonts.title,
                fontSize: 18,
                color: escolhidos.length === elenco.total ? colors.grass : colors.text,
              }}
            >
              {escolhidos.length}/{elenco.total}
            </span>
            <span style={{ ...styles.mutedText, fontSize: 13 }}>
              {rotativo
                ? 'jogadores de linha (o gol roda)'
                : `${goleiros.length}/${N_GOLEIROS} goleiros · ${campo.length}/${elenco.campo} de campo`}
            </span>
          </div>

          {/* ---- baliza (só no formato de goleiros fixos) ---- */}
          {!rotativo && (
            <details open={goleiros.length < N_GOLEIROS} style={{ marginBottom: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: 14, marginBottom: 6 }}>
                🧤 Baliza ({goleiros.length} de {N_GOLEIROS})
              </summary>
              {goleirosSugeridos.length > 0 && (
                <p style={{ ...styles.mutedText, fontSize: 12, margin: '6px 0 8px' }}>
                  Registados como goleiros: {goleirosSugeridos.map((g) => g.name).join(', ')}.
                </p>
              )}
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
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
                              setTornarGkPermanente({
                                ...tornarGkPermanente,
                                [j.id]: e.target.checked,
                              })
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
            </details>
          )}

          {/* ---- pré-escalação ---- */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${colors.line}`,
              background: 'rgba(255,197,49,0.05)',
              marginBottom: 12,
            }}
          >
            <span aria-hidden>⭐</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              {avisoPre ? (
                <>
                  Pré-escalei <strong>{avisoPre.marcados}</strong>{' '}
                  {avisoPre.marcados === 1 ? 'mensalista' : 'mensalistas'} disponíveis.
                  {avisoPre.forcaDeFora > 0 && (
                    <>
                      {' '}
                      <span style={{ color: colors.teamA }}>
                        {avisoPre.forcaDeFora} de fora (não vão ou estão lesionados/a viajar).
                      </span>
                    </>
                  )}
                  {avisoPre.faltam > 0 && (
                    <>
                      {' '}
                      Faltam <strong>{avisoPre.faltam}</strong> — chama do restante do plantel.
                    </>
                  )}
                </>
              ) : (
                'Começa a escalação pelos mensalistas disponíveis. Confirmas e mexes à vontade.'
              )}
            </span>
            <button
              type="button"
              onClick={() => setAvisoPre(preEscalar())}
              className="pb-tap"
              style={{ ...styles.link, flexShrink: 0, color: colors.teamA }}
            >
              {campo.length ? 'refazer' : 'usar mensalistas'}
            </button>
          </div>

          {/* ---- elenco ---- */}
          <div style={{ ...styles.label, marginBottom: 6 }}>
            {rotativo ? `Jogadores (${campo.length} de ${elenco.total})` : `Campo (${campo.length} de ${elenco.campo})`}
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {blocos.map((b) => {
              const c = contarDisponiveis(b.lista, respostas)
              return (
                <div key={b.id}>
                  {/* "⭐ Mensalistas — 12/14 disponíveis": conta quem não
                      disse que falta. Silêncio não é uma ausência. */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      flexWrap: 'wrap',
                      padding: '12px 4px 6px',
                      position: 'sticky',
                      top: 0,
                      background: colors.panel,
                      zIndex: 1,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fonts.title,
                        letterSpacing: 1,
                        fontSize: 12,
                        textTransform: 'uppercase',
                        color: b.id === 'mensalistas' ? colors.teamA : colors.muted,
                      }}
                    >
                      {b.titulo}
                    </span>
                    <span style={{ ...styles.mutedText, fontSize: 12 }}>
                      {c.disponiveis}/{c.total} disponíveis
                      {c.ausentes > 0 ? ` · ${c.ausentes} não vêm` : ''}
                    </span>
                  </div>
                  {b.lista.map((j) => {
                    const resposta = respostas[j.id]
                    const estado = j.availabilityStatus
                    return (
                      <LinhaJogador
                        key={j.id}
                        j={j}
                        marcado={campo.includes(j.id)}
                        onToggle={() => alternar(campo, setCampo, j.id, elenco.campo)}
                        desativado={!campo.includes(j.id) && campo.length >= elenco.campo}
                        extra={
                          <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {/* "não vou" é a informação mais forte da linha:
                                é a própria pessoa a dizer. */}
                            {resposta === false && (
                              <span
                                style={chip(colors.error, `${colors.error}1A`)}
                                title="Disse que não vai a este jogo"
                              >
                                ❌ não vai
                              </span>
                            )}
                            {resposta === true && (
                              <span
                                style={chip(colors.grass, `${colors.grass}1A`)}
                                title="Confirmou que vem"
                              >
                                ✅ vem
                              </span>
                            )}
                            {estadoVisivel(estado) && (
                              <span
                                style={chip(colors.muted)}
                                title={etiquetaDoEstado(estado).rotulo}
                              >
                                {etiquetaDoEstado(estado).icone}
                              </span>
                            )}
                            {rotativo && campo.includes(j.id) && j.gkRotationOk === false && (
                              <span style={chip(colors.muted)} title="Não aceita ir à baliza">
                                🚫 gol
                              </span>
                            )}
                          </span>
                        }
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Os avisos ficam aqui, ao lado do que os resolve — eram um passo
              inteiro só de leitura. */}
          {problemas.map((p, i) => (
            <Aviso key={i} tom={p.tom}>
              {p.texto}
            </Aviso>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => irPara(1)}
              style={{ ...styles.buttonGhost, flex: '1 1 120px', width: 'auto' }}
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={sortear}
              disabled={busy || !podeSortear || bloqueado}
              style={
                busy || !podeSortear || bloqueado
                  ? disabled({ ...styles.button, flex: '2 1 180px', width: 'auto' })
                  : { ...styles.button, flex: '2 1 180px', width: 'auto' }
              }
            >
              {busy ? 'A calcular…' : '🎲 Sortear equipas'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- 3. sorteio ---------- */}
      {passo === 3 && resultado && (
        <div className="pb-stack">
          {ehConversao && (
            <Aviso tom="ok">
              Equipas vindas do <strong>sorteio rápido</strong> — ficaram como estavam. Só as
              posições foram distribuídas.
              {improvisados.length > 0 && (
                <>
                  {' '}
                  <strong>
                    {improvisados.join(' e ')} {improvisados.length === 1 ? 'vai' : 'vão'} à baliza
                  </strong>{' '}
                  sem ser goleiro{improvisados.length === 1 ? '' : 's'} — foi quem foi menos vezes
                  ao gol. Troca à mão se houver melhor candidato.
                </>
              )}
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
              gkMode={resultado.gkMode}
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

          <RodizioPanel
            resultado={resultado}
            historico={historico}
            onDefinirInicio={mudarInicioNoGol}
          />

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
                  {(resultado.lugares || lugares).map((slot) => {
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
                            {(resultado.lugares || lugares).map((s) => (
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
              onClick={() => irPara(4)}
              style={{ ...styles.button, flex: '2 1 180px', width: 'auto' }}
            >
              Continuar para publicar
            </button>
          </div>
          {botoes(ehConversao ? 1 : 2, null)}
        </div>
      )}

      {passo === 3 && !resultado && (
        <div className="pb-card">
          <p style={styles.mutedText}>Ainda não há sorteio. Volta ao passo anterior.</p>
          {botoes(ehConversao ? 1 : 2, null)}
        </div>
      )}

      {/* ---------- 4. publicar ---------- */}
      {passo === 4 && (
        <div className="pb-card">
          {!resultado ? (
            <>
              <p style={styles.mutedText}>Falta sortear as equipas.</p>
              {botoes(ehConversao ? 1 : 2, null)}
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
              {/* Publicar e partilhar eram dois sítios diferentes; agora o
                  texto do grupo está aqui, a um toque. */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => partilhar(true)}
                  style={{ ...styles.buttonGhost, flex: '1 1 140px', width: 'auto' }}
                >
                  📋 Copiar escalação
                </button>
                <button
                  type="button"
                  onClick={() => partilhar(false)}
                  style={{ ...styles.button, flex: '1 1 140px', width: 'auto' }}
                >
                  🟢 Enviar no WhatsApp
                </button>
              </div>
              <button type="button" onClick={recomecar} style={{ ...styles.buttonGhost, marginTop: 10 }}>
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
              {botoes(3, null)}
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
                <Resumo
                  rotulo="Formato"
                  valor={`${rotativo ? '🔄 Goleiro rotativo' : '🧤 Goleiros fixos'} · ${formacaoDe(tamanho).rotulo}`}
                />
                {rotativo && rotacaoMinutos && (
                  <Resumo rotulo="Troca de gol" valor={`a cada ${rotacaoMinutos} min`} />
                )}
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
              {botoes(3, null)}
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
