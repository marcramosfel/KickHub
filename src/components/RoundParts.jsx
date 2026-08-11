import { useState } from 'react'
import Avatar from './Avatar'
import { StarScore } from './StarRating'
import { assisters, matchWinner, ownScorers, scorers, teamPlayers } from '../lib/format'
import { ICONE } from '../lib/icones'
import { GIF_BAGRE, GIF_CRAQUE } from '../lib/gifs'
import { renderResultadoImagem } from '../lib/jogoImagem'
import {
  copiarTexto,
  partilharImagem,
  partilharTexto,
  resumoRodada,
} from '../lib/share'
import { colors, fonts, styles } from '../theme'

// Nome que abre o perfil (se houver onProfile); senão, texto normal.
export function NomeClicavel({ id, nome, onProfile, style }) {
  if (!onProfile || !id) return <span style={style}>{nome}</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onProfile(id)
      }}
      title={`Ver perfil de ${nome}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: 3,
        textDecorationColor: 'rgba(127,160,144,0.6)',
        ...style,
      }}
    >
      {nome}
    </button>
  )
}

// Linha da votação: posição, foto, nome e nº de votos com barrinha proporcional.
function VotoRow({ pos, x, cor, photo, onProfile }) {
  const pct = x.max > 0 ? Math.round((x.votes / x.max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <span
        style={{
          width: 18,
          textAlign: 'right',
          fontSize: 12,
          color: colors.muted,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {pos}
      </span>
      <Avatar name={x.name} photo={photo} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <NomeClicavel id={x.player_id} nome={x.name} onProfile={onProfile} />
        </div>
        <div
          style={{
            height: 3,
            borderRadius: 2,
            marginTop: 3,
            background: cor,
            opacity: 0.55,
            width: `${Math.max(pct, 6)}%`,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: colors.muted,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {x.votes}
      </span>
    </div>
  )
}

// Prémio da rodada (craque/bagre): GIF grande (rosto todo, sem cortar) +
// foto real do jogador votado ao lado + nº de votos, seguido da votação
// completa (toda a gente que recebeu pelo menos um voto).
export function AwardCard({ tipo, list, players, onProfile }) {
  if (!list || !list.length) return null
  const top = list[0].votes
  const winners = list.filter((x) => x.votes === top) // trata empates no topo
  const restantes = list.filter((x) => x.votes < top)
  const totalVotos = list.reduce((s, x) => s + Number(x.votes || 0), 0)
  const craque = tipo === 'craque'
  const cor = craque ? colors.teamA : colors.teamB
  const label = craque ? '👑 Craque da rodada' : '🐟 Bagre da rodada'
  const gif = craque ? GIF_CRAQUE : GIF_BAGRE
  const photoOf = (pid) => (players || []).find((p) => p.player_id === pid)?.photo
  return (
    <div
      style={{
        border: `1px solid ${cor}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0C1915',
      }}
    >
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 13,
          letterSpacing: 1,
          color: cor,
          padding: '10px 12px 0',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
        <img
          src={gif}
          alt={label}
          style={{
            // Fluido: a 132px fixos, num ecrã de 320px sobrava tão pouco que o
            // nome do vencedor ficava com 29px de largura — ilegível.
            width: 'clamp(76px, 26vw, 132px)',
            height: 'clamp(76px, 26vw, 132px)',
            objectFit: 'contain', // mostra o GIF inteiro (rosto todo do Ronaldinho)
            borderRadius: 10,
            background: '#06130D',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {winners.map((w) => (
            <div key={w.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={w.name} photo={photoOf(w.player_id)} size={38} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <NomeClicavel id={w.player_id} nome={w.name} onProfile={onProfile} />
                </div>
                <div style={{ fontSize: 13, color: cor, fontWeight: 600 }}>
                  {w.votes} {w.votes === 1 ? 'voto' : 'votos'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* votação completa: toda a gente que recebeu votos */}
      {restantes.length > 0 && (
        <div style={{ borderTop: `1px solid ${colors.line}`, padding: '8px 12px 10px' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 0.5,
              color: colors.muted,
              marginBottom: 2,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{craque ? 'Quem mais recebeu votos' : 'Quem mais levou votos'}</span>
            <span>
              {totalVotos} {totalVotos === 1 ? 'voto' : 'votos'}
            </span>
          </div>
          {restantes.map((x, i) => (
            <VotoRow
              key={x.player_id}
              pos={winners.length + i + 1}
              x={{ ...x, max: top }}
              cor={cor}
              photo={photoOf(x.player_id)}
              onProfile={onProfile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Avaliação pós-jogo da rodada: só as MÉDIAS. Quem deu que nota a quem não
// sai da base de dados — a votação é anónima entre companheiros, e é isso
// que faz as pessoas votarem a sério.
export function PostRatingsCard({ m, onProfile }) {
  const lista = m?.post_ratings || []
  const aberta = m?.post_rating_status === 'OPEN'
  if (!lista.length) {
    if (!aberta) return null
    return (
      <div style={{ ...styles.panel, padding: 12 }}>
        <div style={{ fontFamily: fonts.title, fontSize: 13, letterSpacing: 1, color: colors.teamA }}>
          ⭐ Avaliação dos companheiros
        </div>
        <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 6 }}>
          A votação está aberta — as médias aparecem aqui à medida que o pessoal avalia.
        </p>
      </div>
    )
  }
  return (
    <div style={{ ...styles.panel, padding: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontFamily: fonts.title, fontSize: 13, letterSpacing: 1, color: colors.teamA }}>
          ⭐ Avaliação dos companheiros
        </span>
        <span style={{ fontSize: 11, color: colors.muted, flexShrink: 0 }}>
          {aberta ? 'votação aberta' : 'votação encerrada'}
        </span>
      </div>
      {lista.map((x) => (
        <div
          key={x.player_id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 0',
            borderTop: `1px solid ${colors.line}`,
          }}
        >
          <Avatar name={x.name} photo={x.photo} size={28} />
          <span className="pb-truncate" style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
            <NomeClicavel id={x.player_id} nome={x.name} onProfile={onProfile} />
          </span>
          <span style={{ flexShrink: 0 }}>
            <StarScore media={x.avg} votos={x.votes} />
          </span>
        </div>
      ))}
      {lista.some((x) => Number(x.votes) === 1) && (
        <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 8 }}>
          Quem tem uma só avaliação ainda tem nota provisória.
        </p>
      )}
    </div>
  )
}

// Botões para mandar a rodada para o grupo: texto pronto a colar ou imagem.
export function ShareRound({ m }) {
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  if (!m) return null

  const dizer = (texto) => {
    setAviso(texto)
    setTimeout(() => setAviso(''), 2500)
  }

  const AVISOS = {
    partilhado: 'Partilhado ✓',
    whatsapp: 'Abri o WhatsApp com o resumo ✓',
    copiado: 'Resumo copiado — cola no grupo ✓',
    manual: '',
    cancelado: '',
    descarregado: 'Imagem guardada ✓',
  }

  const partilhar = async () => {
    setBusy(true)
    try {
      dizer(AVISOS[await partilharTexto(resumoRodada(m))] ?? '')
    } finally {
      setBusy(false)
    }
  }

  const copiar = async () => {
    dizer(AVISOS[await copiarTexto(resumoRodada(m))] ?? '')
  }

  const imagem = async () => {
    setBusy(true)
    try {
      const url = await renderResultadoImagem({ m })
      dizer(AVISOS[await partilharImagem(url, m)] ?? '')
    } catch {
      dizer('Não consegui gerar a imagem.')
    } finally {
      setBusy(false)
    }
  }

  const botaoPequeno = {
    ...styles.buttonGhost,
    fontSize: 13,
    padding: '10px 8px',
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={partilhar} disabled={busy} style={{ ...styles.button, fontSize: 15 }}>
        📲 Partilhar no grupo
      </button>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={imagem} disabled={busy} style={botaoPequeno}>
          🖼️ Como imagem
        </button>
        <button onClick={copiar} disabled={busy} style={botaoPequeno}>
          📋 Copiar texto
        </button>
      </div>
      {aviso && (
        <p style={{ color: colors.grass, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          {aviso}
        </p>
      )}
    </div>
  )
}

// Foto em proporção 16:9 (ou empty state quando não há).
export function PhotoFrame({ src, alt, empty = 'Sem foto', height }) {
  const box = {
    width: '100%',
    aspectRatio: '16 / 9',
    height,
    borderRadius: 12,
    overflow: 'hidden',
    border: `1px solid ${colors.line}`,
    background: '#0C1915',
  }
  if (!src) {
    return (
      <div
        style={{
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 6,
          color: colors.muted,
        }}
      >
        <span style={{ fontSize: 26, opacity: 0.6 }} aria-hidden>
          🖼️
        </span>
        <span style={{ fontSize: 13 }}>{empty}</span>
      </div>
    )
  }
  return (
    <div style={box}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

// Placar em destaque, com o time vencedor realçado.
export function ScoreBoard({ m }) {
  const w = matchWinner(m)
  const col = (name, score, side) => {
    const isWin = w.side === side
    return (
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: side === 'A' ? colors.teamA : colors.teamB,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: isWin ? colors.grass : colors.text,
          }}
        >
          {score}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {col(m.team_a_name || 'Amarelos', Number(m.score_a || 0), 'A')}
        <span style={{ fontFamily: fonts.title, fontSize: 24, color: colors.muted }}>—</span>
        {col(m.team_b_name || 'Azuis', Number(m.score_b || 0), 'B')}
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: w.isDraw ? 'rgba(127,160,144,0.15)' : 'rgba(52,208,88,0.14)',
            color: w.isDraw ? colors.muted : colors.grass,
          }}
        >
          {w.isDraw ? '🤝 Empate' : `🏆 ${w.name}`}
        </span>
      </div>
    </div>
  )
}

// Linha de estatística (gols/assistências) com ícone + texto (nunca só cor).
export function StatLine({ icon, label, list, emptyText, onProfile, campo: campoDado }) {
  // O campo era deduzido do rótulo ("Gols" → goals, tudo o resto → assists).
  // Com um terceiro número (autogolos) isso passava a mentir, por isso agora
  // diz-se qual é; o fallback antigo fica para as chamadas que não o passam.
  const campo = campoDado || (label === 'Gols' ? 'goals' : 'assists')
  return (
    <div style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span aria-hidden style={{ flexShrink: 0 }}>
        {icon}
      </span>
      <span>
        <span style={{ color: colors.muted }}>{label}: </span>
        {list.length ? (
          list.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={p.player_id} nome={p.name} onProfile={onProfile} />
              {p[campo] > 1 && <span style={{ color: colors.muted }}> ×{p[campo]}</span>}
            </span>
          ))
        ) : (
          <span style={{ color: colors.muted }}>{emptyText}</span>
        )}
      </span>
    </div>
  )
}

// Chips de jogadores de um time.
export function TeamRoster({ m, side, onProfile }) {
  const cor = side === 'A' ? colors.teamA : colors.teamB
  const name = side === 'A' ? m.team_a_name || 'Amarelos' : m.team_b_name || 'Azuis'
  const list = teamPlayers(m, side)
  if (!list.length) return null
  return (
    <div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: cor,
          marginBottom: 6,
        }}
      >
        {name}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {list.map((p) => {
          const conteudo = (
            <>
              <Avatar name={p.name} photo={p.photo} size={22} />
              {p.name}
            </>
          )
          const estilo = {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px 4px 4px',
            borderRadius: 999,
            background: '#0C1915',
            border: `1px solid ${colors.line}`,
            fontSize: 13,
            color: colors.text,
          }
          return onProfile ? (
            <button
              key={p.player_id}
              type="button"
              onClick={() => onProfile(p.player_id)}
              title={`Ver perfil de ${p.name}`}
              style={{ ...estilo, cursor: 'pointer', font: 'inherit', fontSize: 13 }}
            >
              {conteudo}
            </button>
          ) : (
            <span key={p.player_id} style={estilo}>
              {conteudo}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// O que fica no lugar do craque, do bagre e das estrelas enquanto o jogador
// não votar. Só aparece a quem ainda pode votar naquela rodada.
export function SegredoAteVotar({ onVotar }) {
  return (
    <div
      style={{
        ...styles.panel,
        border: `1px dashed ${colors.teamA}`,
        background: 'rgba(255,197,49,0.06)',
        textAlign: 'center',
        padding: 20,
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 6 }} aria-hidden>
        🔒
      </div>
      <div style={{ ...styles.title, fontSize: 16 }}>Vota para ver</div>
      <p style={{ ...styles.mutedText, fontSize: 13, margin: '8px auto 0', maxWidth: 340 }}>
        O 👑 craque, o 🐟 bagre e as ⭐ estrelas desta rodada aparecem assim que enviares o teu
        voto. O placar e os gols ficam à vista — esses já os viste em campo.
      </p>
      {onVotar && (
        <button type="button" onClick={onVotar} style={{ ...styles.button, marginTop: 14 }}>
          Votar agora — leva 1 minuto
        </button>
      )}
    </div>
  )
}

// Corpo partilhado de uma rodada (placar, rosters, gols/assistências, local, obs).
// `full` inclui as fotos (detalhe/destaque); sem `full` mostra só o resumo.
//
// `bloqueado` tapa o resultado das VOTAÇÕES (craque, bagre, estrelas) a quem
// ainda tem voto por dar naquela rodada — ver `resultadoBloqueado`.
export function RoundBody({ m, full = false, onProfile, bloqueado = false, onVotar }) {
  const temTimes = (m.players || []).some((p) => p.team)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {full && <PhotoFrame src={m.winner_photo} alt="Time vencedor" empty="Sem foto do time vencedor" />}

      <ScoreBoard m={m} />

      {bloqueado ? (
        <SegredoAteVotar onVotar={onVotar} />
      ) : (
        /* prémios da rodada — ao lado dos campeões, logo no destaque */
        ((m.craque && m.craque.length) || (m.bagre && m.bagre.length)) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AwardCard tipo="craque" list={m.craque} players={m.players} onProfile={onProfile} />
            <AwardCard tipo="bagre" list={m.bagre} players={m.players} onProfile={onProfile} />
          </div>
        )
      )}

      {temTimes && (
        // pb-cards empilha no telemóvel em vez de espremer duas colunas
        <div className="pb-cards" style={{ gap: 10 }}>
          <TeamRoster m={m} side="A" onProfile={onProfile} />
          <TeamRoster m={m} side="B" onProfile={onProfile} />
        </div>
      )}

      {/* só no detalhe: no destaque da Home a lista de médias empurrava os
          gols e as assistências para fora do primeiro ecrã. Tapada também
          para quem ainda não votou — é o resultado de uma votação. */}
      {full && !bloqueado && <PostRatingsCard m={m} onProfile={onProfile} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <StatLine
          icon={ICONE.gols}
          label="Gols"
          campo="goals"
          list={scorers(m)}
          emptyText="sem gols"
          onProfile={onProfile}
        />
        <StatLine
          icon={ICONE.assistencias}
          label="Assistências"
          campo="assists"
          list={assisters(m)}
          emptyText="sem assistências"
          onProfile={onProfile}
        />
        {/* Autogolos só aparecem quando os há — uma linha "sem autogolos" em
            todas as rodadas seria ruído, e as rodadas antigas têm todas 0. */}
        {ownScorers(m).length > 0 && (
          <StatLine
            icon={ICONE.autogolos}
            label="Autogolos"
            campo="own_goals"
            list={ownScorers(m)}
            emptyText=""
            onProfile={onProfile}
          />
        )}
      </div>

      {full && (m.has_location_photo || m.location_photo) && (
        <div>
          <div style={{ ...styles.label, marginBottom: 6 }}>📍 Local da pelada</div>
          <PhotoFrame src={m.location_photo} alt="Local da pelada" empty="Sem foto do local" />
        </div>
      )}

      {m.notes && (
        <p style={{ fontSize: 14, color: colors.text, lineHeight: 1.5 }}>
          <span style={{ color: colors.muted }}>📝 </span>
          {m.notes}
        </p>
      )}
    </div>
  )
}
