// Contagem regressiva do próximo jogo.
//
// Tudo aqui é função pura: o estado do jogo sai do ISO guardado na base de
// dados + o relógio recebido por parâmetro. Não há estado acumulado, por isso
// recarregar a página (ou abrir o site duas horas depois) dá sempre o mesmo
// resultado — não existe "contador" a andar que se possa dessincronizar.

export const TIMEZONE = 'Europe/Lisbon'

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

// Janela em que se assume que o jogo está a decorrer sem ninguém ter mexido no
// estado: uma pelada dura ~1h30, damos 2h antes de pedir o resultado.
export const DURACAO_JOGO_MS = 2 * HORA

// Abaixo disto deixa de fazer sentido mostrar a contagem ao segundo.
export const JANELA_IMINENTE_MS = 1 * HORA

const dois = (n) => String(n).padStart(2, '0')

// Divide uma duração em dias/horas/minutos/segundos.
// Devolve também as versões em string com 2 dígitos, para o ecrã não dançar.
export function partesDoTempo(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0))
  const dias = Math.floor(total / DIA)
  const horas = Math.floor((total % DIA) / HORA)
  const minutos = Math.floor((total % HORA) / MINUTO)
  const segundos = Math.floor((total % MINUTO) / SEGUNDO)
  return {
    dias,
    horas,
    minutos,
    segundos,
    ddStr: dois(dias),
    hhStr: dois(horas),
    mmStr: dois(minutos),
    ssStr: dois(segundos),
  }
}

// Data válida a partir de um ISO, de um timestamp em ms ou de um Date já
// pronto. null se não der. O 0 é aceite de propósito (é 1970, não "vazio"):
// senão um `agora` numérico nessa fronteira caía no relógio real e a função
// deixava de ser pura.
function paraData(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

const plural = (n, singular, pluralPalavra) => `${n} ${n === 1 ? singular : pluralPalavra}`

// "2 dias e 3 horas", "45 min e 10 s" — só as duas unidades mais significativas,
// que é o que uma pessoa lê de relance.
function descreverFalta({ dias, horas, minutos, segundos }) {
  if (dias > 0) {
    return horas > 0
      ? `${plural(dias, 'dia', 'dias')} e ${plural(horas, 'hora', 'horas')}`
      : plural(dias, 'dia', 'dias')
  }
  if (horas > 0) {
    return minutos > 0
      ? `${plural(horas, 'hora', 'horas')} e ${minutos} min`
      : plural(horas, 'hora', 'horas')
  }
  if (minutos > 0) return segundos > 0 ? `${minutos} min e ${segundos} s` : `${minutos} min`
  return `${segundos} s`
}

const vazio = (estado, texto) => ({
  estado,
  ms: 0,
  msDecorridos: 0,
  dias: 0,
  horas: 0,
  minutos: 0,
  segundos: 0,
  ddStr: '00',
  hhStr: '00',
  mmStr: '00',
  ssStr: '00',
  texto,
})

// Estado do jogo num dado instante.
//
// `ms` são os milissegundos que FALTAM (0 se a hora já passou) e `msDecorridos`
// os que já passaram desde o apito inicial (0 se ainda não começou).
export function estadoDoJogo(kickoffISO, agora = new Date(), status) {
  // O que o admin marcou à mão manda sobre o relógio: um jogo cancelado
  // continua cancelado mesmo que a hora já tenha passado.
  if (status === 'CANCELLED') return vazio('cancelado', 'Jogo cancelado')
  if (status === 'COMPLETED') return vazio('concluido', 'Jogo concluído')

  const kickoff = paraData(kickoffISO)
  if (!kickoff) return vazio('sem-jogo', 'Sem jogo marcado')

  const agoraData = paraData(agora) || new Date()
  const diferenca = kickoff.getTime() - agoraData.getTime()

  if (diferenca <= 0) {
    const decorridos = -diferenca
    // IN_PROGRESS não expira: enquanto o admin não fechar a rodada, está a dar.
    if (status === 'IN_PROGRESS' || decorridos < DURACAO_JOGO_MS) {
      return { ...vazio('a-decorrer', 'Jogo em andamento'), msDecorridos: decorridos }
    }
    return { ...vazio('aguarda-resultado', 'Aguardando resultado'), msDecorridos: decorridos }
  }

  const partes = partesDoTempo(diferenca)

  if (diferenca < JANELA_IMINENTE_MS) {
    return { ...partes, estado: 'iminente', ms: diferenca, msDecorridos: 0, texto: 'O jogo começa em breve' }
  }

  return {
    ...partes,
    estado: 'a-contar',
    ms: diferenca,
    msDecorridos: 0,
    texto: `Começa em ${descreverFalta(partes)}`,
  }
}

// Data do jogo em pt-PT no fuso de Lisboa.
// Aritmética de fusos à mão dá sempre asneira no horário de verão — o Intl
// trata do UTC+0/UTC+1 por nós.
export function formatarDataDoJogo(kickoffISO) {
  const kickoff = paraData(kickoffISO)
  if (!kickoff) return { diaDaSemana: '', data: '', hora: '', completo: '' }

  const fmt = (opcoes) =>
    new Intl.DateTimeFormat('pt-PT', { timeZone: TIMEZONE, ...opcoes }).format(kickoff)

  const semana = fmt({ weekday: 'long' }) // pt-PT devolve minúsculas ("quarta-feira")
  const diaDaSemana = semana.charAt(0).toUpperCase() + semana.slice(1)
  const data = fmt({ day: 'numeric', month: 'long' })
  const hora = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })

  return { diaDaSemana, data, hora, completo: `${diaDaSemana}, ${data} às ${hora}` }
}
