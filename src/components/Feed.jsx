import { useState } from 'react'
import { formatarDataDoJogo } from '../lib/countdown'
import {
  copiarTexto,
  partilharImagem,
  partilharTexto,
  renderLineupCard,
  renderRoundCard,
  resumoSorteio,
} from '../lib/share'
import { nomeDaEquipa } from '../lib/substitutions'
import { resultadoBloqueado } from '../lib/voting'
import Avatar from './Avatar'
import { colors, fonts, chip } from '../theme'

// O feed da pelada: o que o admin publicou, do mais recente para o mais
// antigo — pela data de PUBLICAÇÃO, não pela data do jogo. Publicar hoje o
// sorteio de sábado põe-no no topo hoje; publicar o resultado na segunda
// põe o resultado no topo na segunda.

const TIPO = {
  SORTEIO: { icone: '🎲', cor: '#34D058' },
  RESULTADO: { icone: '🏆', cor: '#FFC531' },
  CANCELAMENTO: { icone: '🚫', cor: '#FF5A5A' },
  SUBSTITUICAO: { icone: '🔄', cor: '#FFC531' },
}

// "há 2 h" / "ontem" / "12 de julho" — datas de feed leem-se relativas.
function quando(iso) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const seg = Math.round((Date.now() - t) / 1000)
  // uma data "no futuro" (relógio do telemóvel atrasado face ao servidor)
  // mostra a data absoluta — "agora mesmo" durante o desvio inteiro mentia
  if (seg >= 0 && seg < 60) return 'agora mesmo'
  if (seg >= 0 && seg < 3600) return `há ${Math.floor(seg / 60)} min`
  if (seg >= 0 && seg < 86400) return `há ${Math.floor(seg / 3600)} h`
  if (seg >= 0 && seg < 172800) return 'ontem'
  const d = formatarDataDoJogo(iso)
  return d.hora ? d.data : ''
}

// O snapshot `payload.teams` do post de SORTEIO, no formato da escalação —
// é o que deixa partilhar o texto e o card de sorteios que já não são o
// próximo jogo (o snapshot existe exatamente para isso).
function lineupDoPayload(payload) {
  return ['A', 'B'].flatMap((team) =>
    (payload?.teams?.[team] || []).map((j) => ({
      team,
      name: j.name,
      is_goalkeeper: j.gk === true,
      overall_at_draw: j.overall ?? null,
    }))
  )
}

// Placar compacto do payload de um post de resultado.
function Placar({ payload }) {
  if (payload?.score_a == null) return null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 14, margin: '6px 0' }}>
      <span style={{ color: '#8A96A0', fontFamily: fonts.title, fontSize: 15 }}>⚫ Pretos</span>
      <span style={{ fontFamily: fonts.title, fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {payload.score_a}–{payload.score_b}
      </span>
      <span style={{ color: '#F2F5F2', fontFamily: fonts.title, fontSize: 15 }}>Brancos ⚪</span>
    </div>
  )
}

// Gols/assistências/defesas do payload, em linhas curtas.
function LinhasDoResultado({ payload }) {
  const linha = (icone, lista, rotulo) => {
    if (!Array.isArray(lista) || !lista.length) return null
    const texto = lista.map((g) => (g.n > 1 ? `${g.name} (${g.n})` : g.name)).join(', ')
    return (
      <p key={rotulo} style={{ fontSize: 13, margin: '2px 0' }}>
        <span aria-hidden>{icone}</span> <span style={{ color: colors.muted }}>{rotulo}:</span> {texto}
      </p>
    )
  }
  return (
    <div>
      {linha('⚽', payload?.goals, 'Gols')}
      {linha('🅰️', payload?.assists, 'Assistências')}
      {linha('🧤', payload?.saves, 'Defesas')}
    </div>
  )
}

// Craque e bagre do post de resultado — lidos da votação ATUAL (o get_feed
// resolve), com a contagem de vezes que cada um já levou o prémio.
function DestaqueCraqueBagre({ post, jogadores, onProfile }) {
  const blocos = [
    { chave: 'craque', rotulo: 'CRAQUE DO JOGO', icone: '👑', cor: '#FFC531', campo: 'craques', sufixo: 'vez(es) craque' },
    { chave: 'bagre', rotulo: 'BAGRE DO JOGO', icone: '🐟', cor: '#C89B6A', campo: 'bagres', sufixo: 'vez(es) bagre — com carinho' },
  ].filter((b) => post[b.chave]?.player_id)
  if (!blocos.length) return null

  return (
    <div className="pb-cards" style={{ gap: 10, marginTop: 10 }}>
      {blocos.map((b) => {
        const info = post[b.chave]
        const j = jogadores?.find((x) => x.id === info.player_id)
        const vezes = j?.[b.campo]
        return (
          <button
            key={b.chave}
            type="button"
            onClick={() => onProfile?.(info.player_id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${b.cor}55`,
              background: `${b.cor}0F`,
              color: colors.text,
              font: 'inherit',
              textAlign: 'left',
              cursor: onProfile ? 'pointer' : 'default',
            }}
          >
            <Avatar name={info.name} photo={info.photo} size={40} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, letterSpacing: 1, color: b.cor, fontFamily: fonts.title, display: 'block' }}>
                {b.icone} {b.rotulo}
              </span>
              <span className="pb-truncate" style={{ fontWeight: 700, fontSize: 14, display: 'block' }}>
                {info.name}
              </span>
              {vezes != null && vezes > 0 && (
                <span style={{ fontSize: 11, color: colors.muted }}>
                  {vezes}ª {b.sufixo}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// O corpo específico de cada tipo de post.
function Conteudo({ post, jogadores, onProfile, bloqueado, onVotar }) {
  const p = post.payload || {}
  if (post.type === 'RESULTADO') {
    return (
      <>
        {post.photo && (
          <img
            src={post.photo}
            alt="Foto do jogo"
            style={{ width: '100%', borderRadius: 12, aspectRatio: '16 / 9', objectFit: 'cover', margin: '8px 0' }}
          />
        )}
        <Placar payload={p} />
        <LinhasDoResultado payload={p} />
        {/* o craque e o bagre ficam tapados a quem ainda tem voto por dar
            nesta rodada — o resto do post (placar, gols) fica à vista */}
        {bloqueado ? (
          <button
            type="button"
            onClick={onVotar}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              marginTop: 10,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px dashed ${colors.teamA}`,
              background: 'rgba(255,197,49,0.06)',
              color: colors.text,
              font: 'inherit',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <span aria-hidden style={{ fontSize: 20 }}>🔒</span>
            <span style={{ flex: 1 }}>
              <strong>Vota para ver</strong> quem foi o craque e o bagre.
            </span>
            <span style={{ color: colors.teamA, fontWeight: 700, flexShrink: 0 }}>Votar →</span>
          </button>
        ) : (
          <DestaqueCraqueBagre post={post} jogadores={jogadores} onProfile={onProfile} />
        )}
      </>
    )
  }
  if (post.type === 'SORTEIO') {
    return (
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '6px 0' }}>
        {['A', 'B'].map((lado) => (
          <span key={lado} style={chip(lado === 'A' ? '#8A96A0' : '#F2F5F2')}>
            {nomeDaEquipa(lado)} {p[lado === 'A' ? 'team_a_overall' : 'team_b_overall'] ?? ''}
          </span>
        ))}
        {p.balance_pct != null && (
          <span style={chip(colors.grass, `${colors.grass}1A`)}>⚖️ {Number(p.balance_pct).toFixed(1)}%</span>
        )}
      </div>
    )
  }
  if (post.type === 'SUBSTITUICAO') {
    // dois formatos: troca de equipas (swap, a⇄b) ou substituição (sai→entra)
    if (p.swap) {
      return (
        <p style={{ fontSize: 14, margin: '4px 0' }}>
          <strong>{p.a_name}</strong>{' '}
          <span style={{ color: colors.muted, fontSize: 12 }}>({nomeDaEquipa(p.a_team)})</span>{' '}
          <span aria-hidden>⇄</span> <strong>{p.b_name}</strong>{' '}
          <span style={{ color: colors.muted, fontSize: 12 }}>({nomeDaEquipa(p.b_team)})</span>
          <span style={{ color: colors.muted, fontSize: 12 }}> — trocaram de time</span>
        </p>
      )
    }
    return (
      <p style={{ fontSize: 14, margin: '4px 0' }}>
        <span style={{ color: colors.muted, textDecoration: 'line-through' }}>{p.out_name}</span>{' '}
        → <strong>{p.in_name}</strong>{' '}
        <span style={{ color: colors.muted, fontSize: 12 }}>
          ({nomeDaEquipa(p.team)}
          {p.kind === 'TROCA' ? ' · troca' : ' · desistência'})
        </span>
      </p>
    )
  }
  return null
}

function Publicacao({ post, jogo, jogadores, onProfile, onAbrirJogo, bloqueado, onVotar }) {
  const [feedback, setFeedback] = useState('')
  const t = TIPO[post.type] || { icone: '📌', cor: colors.muted }

  const avisar = (msg) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 2200)
  }

  // O sorteio partilhável: o jogo completo quando este post é o próximo
  // jogo, senão o snapshot `payload.teams` congelado na publicação.
  const jogoPartilha =
    post.type === 'SORTEIO'
      ? jogo?.lineup?.length
        ? jogo
        : {
            ...post.payload,
            kickoff_at: post.payload?.kickoff_at ?? post.match?.kickoff_at,
            location: post.payload?.location ?? post.match?.location,
            lineup: lineupDoPayload(post.payload),
          }
      : null

  // O texto partilhável do post: título + resenha + números principais.
  const textoDoPost = () => {
    if (jogoPartilha?.lineup?.length) return resumoSorteio(jogoPartilha, post.body || '')
    const p = post.payload || {}
    const linhas = [post.title]
    if (post.type === 'RESULTADO' && p.score_a != null) {
      linhas.push(`⚫ Pretos ${p.score_a} x ${p.score_b} Brancos ⚪`)
    }
    if (post.body) linhas.push('', post.body)
    return linhas.join('\n').trim()
  }

  const partilhar = async () => {
    const r = await partilharTexto(textoDoPost())
    if (r === 'copiado') avisar('Copiado!')
  }

  const copiar = async () => {
    await copiarTexto(textoDoPost())
    avisar('Copiado!')
  }

  const gerarCard = async () => {
    avisar('A gerar…')
    try {
      // o card do resultado leva os números que o próprio post mostra:
      // gols+assistências fundidos por nome, e o craque/bagre atuais (sem
      // contagem de votos — o card omite o sufixo quando ela não existe)
      const p = post.payload || {}
      const porNome = new Map()
      for (const g of p.goals || []) porNome.set(g.name, { name: g.name, goals: g.n, assists: 0 })
      for (const a of p.assists || []) {
        const linha = porNome.get(a.name) || { name: a.name, goals: 0, assists: 0 }
        linha.assists = a.n
        porNome.set(a.name, linha)
      }
      const dataUrl =
        post.type === 'SORTEIO'
          ? await renderLineupCard(jogoPartilha, post.body || '')
          : await renderRoundCard({
              played_at: p.played_at,
              team_a_name: 'Pretos',
              team_b_name: 'Brancos',
              score_a: p.score_a,
              score_b: p.score_b,
              winner_photo: post.photo,
              notes: post.body || null,
              players: [...porNome.values()],
              craque: post.craque?.player_id ? [{ name: post.craque.name, votes: null }] : [],
              bagre: post.bagre?.player_id ? [{ name: post.bagre.name, votes: null }] : [],
            })
      // no telemóvel abre a partilha nativa (WhatsApp); no desktop descarrega
      const r = await partilharImagem(dataUrl, { played_at: p.played_at || post.published_at })
      if (r !== 'cancelado') avisar(r === 'partilhado' ? 'Partilhado!' : 'Imagem gerada!')
    } catch {
      avisar('Não consegui gerar a imagem.')
    }
  }

  const d = formatarDataDoJogo(post.match?.kickoff_at)

  return (
    <article className="pb-card" style={{ borderLeft: `3px solid ${t.cor}` }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: fonts.title, fontSize: 15, letterSpacing: 0.5 }}>
          {post.title}
        </span>
        <span style={{ fontSize: 11, color: colors.muted, marginLeft: 'auto', flexShrink: 0 }}>
          {quando(post.published_at)}
        </span>
      </header>

      {(d.hora || post.match?.location) && (
        <p style={{ fontSize: 12, color: colors.muted, margin: '2px 0 0' }}>
          {[d.hora ? `${d.data} · ${d.hora}` : '', post.match?.location].filter(Boolean).join(' — ')}
        </p>
      )}

      {post.body && (
        <div style={{ margin: '8px 0 2px' }}>
          {post.body.split('\n').map((linha, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.5, margin: '4px 0' }}>
              {linha}
            </p>
          ))}
        </div>
      )}

      <Conteudo
        post={post}
        jogadores={jogadores}
        onProfile={onProfile}
        bloqueado={bloqueado}
        onVotar={onVotar}
      />

      <footer style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* um jogo cancelado não existe em mais lado nenhum — o contexto
            todo está neste post, e um botão para o vazio só confundia */}
        {post.type !== 'CANCELAMENTO' && (
          <button type="button" onClick={() => onAbrirJogo?.(post)} className="pb-tab" style={{ fontSize: 13 }}>
            Abrir jogo
          </button>
        )}
        <button type="button" onClick={partilhar} className="pb-tab" style={{ fontSize: 13 }}>
          📤 WhatsApp
        </button>
        <button type="button" onClick={copiar} className="pb-tab" style={{ fontSize: 13 }}>
          📋 Copiar
        </button>
        {(post.type === 'SORTEIO' || post.type === 'RESULTADO') && (
          <button type="button" onClick={gerarCard} className="pb-tab" style={{ fontSize: 13 }}>
            🖼️ Card
          </button>
        )}
        {feedback && (
          <span role="status" style={{ fontSize: 12, color: colors.grass }}>
            {feedback}
          </span>
        )}
      </footer>
    </article>
  )
}

export default function Feed({ posts, proximoJogo, jogadores, porVotar, onProfile, onNavigate, onVotar }) {
  if (!Array.isArray(posts) || posts.length === 0) return null

  const abrirJogo = (post) => {
    // o ecrã "Próximo jogo" mostra sempre O próximo — só serve se este post
    // for mesmo dele; qualquer outro jogo abre direto no detalhe da rodada
    // (deep-link via matchId, que o App guarda para o ecrã de histórico)
    if (post.match?.id && post.match.id === proximoJogo?.id) onNavigate?.('next')
    else onNavigate?.('history', { matchId: post.match?.id || null })
  }

  // quem embrulha em <section> é o ecrã que o mostra — aqui é só a lista
  return (
    <div className="pb-stack">
      {posts.map((post) => (
        <Publicacao
          key={post.id}
          post={post}
          jogo={post.match?.id === proximoJogo?.id ? proximoJogo : null}
          jogadores={jogadores}
          onProfile={onProfile}
          onAbrirJogo={abrirJogo}
          bloqueado={resultadoBloqueado(post.match?.id, porVotar)}
          onVotar={() => onVotar?.(post.match?.id)}
        />
      ))}
    </div>
  )
}
