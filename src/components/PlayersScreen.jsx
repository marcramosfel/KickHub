import { useMemo, useState } from 'react'
import {
  ETIQUETA_STATUS,
  nomeDaPosicao,
  PLAYER_TYPE,
  POSITIONS,
  siglaDaPosicao,
} from '../lib/positions'
import { estadoVisivel, etiquetaDoEstado } from '../lib/plantel'
import Avatar from './Avatar'
import { SectionTitle } from './Ui'
import { colors, styles, chip } from '../theme'

// Plantel: quem é quem, e onde joga cada um.
//
// Esta página existe para responder a uma pergunta prática antes do sorteio —
// "temos defesas a mais?" — por isso agrupa por posição em vez de ser só uma
// lista alfabética.

const TOM = {
  aviso: colors.teamA,
  ok: colors.grass,
  info: colors.teamB,
  neutro: colors.muted,
}

// O estado no plantel usa os mesmos tons (`lib/plantel.js` devolve o nome).
const TOM_ESTADO = {
  ok: colors.grass,
  info: colors.teamB,
  aviso: colors.teamA,
  erro: colors.error,
}

// Metade do grupo tem acento no nome (André, Márcio, João) e ninguém os
// escreve na caixa de procura. Sem tirar os diacríticos aos dois lados,
// escrever "andre" não encontrava o André.
const semAcentos = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

function Cartao({ p, onProfile }) {
  const e = ETIQUETA_STATUS[p.positionStatus] || ETIQUETA_STATUS.NOT_SELECTED
  const conteudo = (
    <>
      <Avatar name={p.name} photo={p.photo} size={44} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          className="pb-truncate"
          style={{ fontSize: 15, fontWeight: 700, display: 'flex', gap: 6 }}
        >
          {p.isMember && (
            <span aria-label="mensalista" title="Mensalista">
              ⭐
            </span>
          )}
          <span className="pb-truncate">{p.name}</span>
        </div>
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          {p.primaryPosition ? nomeDaPosicao(p.primaryPosition) : 'Sem posição definida'}
          {p.secondaryPosition ? ` · 2.ª ${siglaDaPosicao(p.secondaryPosition)}` : ''}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* O estado só aparece quando diz alguma coisa: "🟢 Disponível" em
              trinta cartões é ruído — quem interessa ver é quem NÃO está. */}
          {estadoVisivel(p.availabilityStatus) && (
            <span style={chip(TOM_ESTADO[etiquetaDoEstado(p.availabilityStatus).tom] || colors.muted)}>
              <span aria-hidden>{etiquetaDoEstado(p.availabilityStatus).icone}</span>
              {etiquetaDoEstado(p.availabilityStatus).rotulo}
            </span>
          )}
          <span style={chip(TOM[e.tom] || colors.muted)}>
            <span aria-hidden>{e.icone}</span>
            {e.texto}
          </span>
          {p.acceptsOther && p.primaryPosition && (
            <span style={chip(colors.muted)}>🔄 Versátil</span>
          )}
        </div>
      </div>
      {p.overall != null && (
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: p.playerType === PLAYER_TYPE.GOALKEEPER ? colors.teamB : colors.teamA,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {p.overall}
          </div>
          <div style={{ fontSize: 9, color: colors.muted, letterSpacing: 1 }}>OVR</div>
        </div>
      )}
    </>
  )

  const base = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    textAlign: 'left',
  }

  return (
    <div className="pb-card pb-card-hover" style={{ padding: 12 }}>
      {onProfile ? (
        <button
          type="button"
          onClick={() => onProfile(p.id)}
          aria-label={`Ver perfil de ${p.name}`}
          style={{ ...base, background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}
        >
          {conteudo}
        </button>
      ) : (
        <div style={base}>{conteudo}</div>
      )}
    </div>
  )
}

export default function PlayersScreen({ jogadores, onProfile }) {
  const [procura, setProcura] = useState('')
  const [agrupar, setAgrupar] = useState(true)

  const filtrados = useMemo(() => {
    const q = semAcentos(procura.trim())
    if (!q) return jogadores
    return jogadores.filter((p) => semAcentos(p.name).includes(q))
  }, [jogadores, procura])

  const grupos = useMemo(() => {
    const goleiros = filtrados.filter(
      (p) => p.playerType === PLAYER_TYPE.GOALKEEPER || p.primaryPosition === 'GK'
    )
    const usados = new Set(goleiros.map((p) => p.id))
    const porPosicao = POSITIONS.filter((pos) => pos.id !== 'GK').map((pos) => ({
      pos,
      lista: filtrados.filter((p) => !usados.has(p.id) && p.primaryPosition === pos.id),
    }))
    for (const g of porPosicao) for (const p of g.lista) usados.add(p.id)
    const semPosicao = filtrados.filter((p) => !usados.has(p.id))
    return { goleiros, porPosicao, semPosicao }
  }, [filtrados])

  return (
    <div>
      <h1 style={{ ...styles.title, fontSize: 22, marginBottom: 4 }}>
        Jogadores <span style={{ color: colors.grass }}>👥</span>
      </h1>
      <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 14 }}>
        {jogadores.length} {jogadores.length === 1 ? 'jogador aprovado' : 'jogadores aprovados'} no
        plantel.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{ ...styles.input, flex: '1 1 200px', width: 'auto' }}
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="🔎 Procurar jogador"
          aria-label="Procurar jogador"
        />
        <button
          type="button"
          onClick={() => setAgrupar((v) => !v)}
          aria-pressed={agrupar}
          style={{
            ...styles.buttonGhost,
            width: 'auto',
            flex: '0 0 auto',
            padding: '12px 16px',
            fontSize: 14,
          }}
        >
          {agrupar ? '📋 Ver em lista' : '🧭 Agrupar por posição'}
        </button>
      </div>

      {filtrados.length === 0 && (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 26 }}>
          <p style={styles.mutedText}>
            {procura ? 'Nenhum jogador com esse nome.' : 'Ainda não há jogadores aprovados.'}
          </p>
        </div>
      )}

      {!agrupar && (
        <div className="pb-cards">
          {filtrados.map((p) => (
            <Cartao key={p.id} p={p} onProfile={onProfile} />
          ))}
        </div>
      )}

      {agrupar && filtrados.length > 0 && (
        <>
          {grupos.goleiros.length > 0 && (
            <>
              <SectionTitle cor={colors.teamB}>🧤 Goleiros ({grupos.goleiros.length})</SectionTitle>
              <div className="pb-cards">
                {grupos.goleiros.map((p) => (
                  <Cartao key={p.id} p={p} onProfile={onProfile} />
                ))}
              </div>
            </>
          )}

          {grupos.porPosicao
            .filter((g) => g.lista.length > 0)
            .map((g) => (
              <div key={g.pos.id}>
                <SectionTitle>
                  {g.pos.icon} {g.pos.label} ({g.lista.length})
                </SectionTitle>
                <div className="pb-cards">
                  {g.lista.map((p) => (
                    <Cartao key={p.id} p={p} onProfile={onProfile} />
                  ))}
                </div>
              </div>
            ))}

          {grupos.semPosicao.length > 0 && (
            <>
              <SectionTitle cor={colors.teamA}>
                ⚠️ Sem posição definida ({grupos.semPosicao.length})
              </SectionTitle>
              <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 10 }}>
                Estes jogadores ainda não escolheram onde jogam. Enquanto não escolherem, o sorteio
                não os consegue colocar em campo.
              </p>
              <div className="pb-cards">
                {grupos.semPosicao.map((p) => (
                  <Cartao key={p.id} p={p} onProfile={onProfile} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
