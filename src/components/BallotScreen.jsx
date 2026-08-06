import { useCallback, useEffect, useMemo, useState } from 'react'
import { getRoundBallot, submitRoundVote } from '../api'
import { formatDia } from '../lib/format'
import { estadoDaVotacao, prazoLegivel } from '../lib/voting'
import { ROTAS, navegarPara } from '../lib/router'
import Avatar from './Avatar'
import { StarLegend, StarPicker } from './StarRating'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles, disabled } from '../theme'

// A cédula da rodada: estrelas + craque + bagre, num ecrã e num envio.
//
// Antes eram duas votações em dois cartões, os dois escondidos dentro de
// Estatísticas → Rodadas: seis navegações e dois envios. Era essa a razão de
// quase ninguém votar, e é isso que este ecrã existe para desfazer.
//
// Três passos num só fluxo, com o objetivo declarado de acabar em menos de
// um minuto. Guardar é sempre possível a meio — quem sai não perde o que fez.

const PASSOS = [
  { id: 1, titulo: 'O teu time', icone: '⭐' },
  { id: 2, titulo: 'Craque', icone: '👑' },
  { id: 3, titulo: 'Bagre', icone: '😂' },
]

function Progresso({ passo, total }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
          Passo {passo} de {total}
        </span>
        <span style={{ fontSize: 12, color: colors.muted }}>menos de 1 minuto</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }} role="progressbar" aria-valuenow={passo} aria-valuemin={1} aria-valuemax={total}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 999,
              background: i < passo ? colors.grass : colors.line,
              transition: 'background .2s',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// Chips de escolha única, com foto. O mesmo padrão do cartão antigo — o que
// muda é o sítio onde vive, não a forma de escolher.
function Escolha({ opcoes, valor, cor, onEscolher, vazio }) {
  if (!opcoes.length) {
    return <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 8 }}>{vazio}</p>
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {opcoes.map((p) => {
        const sel = valor === p.player_id
        return (
          <button
            key={p.player_id}
            type="button"
            aria-pressed={sel}
            onClick={() => onEscolher(sel ? null : p.player_id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px 7px 7px',
              borderRadius: 999,
              border: `1px solid ${sel ? cor : colors.line}`,
              background: sel ? `${cor}1A` : '#0C1915',
              color: sel ? cor : colors.text,
              fontSize: 15,
              fontWeight: sel ? 700 : 400,
              minHeight: 44,
            }}
          >
            <Avatar name={p.name} photo={p.photo} size={30} />
            {p.name}
          </button>
        )
      })}
    </div>
  )
}

export default function BallotScreen({ session, matchId, token, onSair, onVotado }) {
  const [cedula, setCedula] = useState(null)
  const [erro, setErro] = useState('')
  const [passo, setPasso] = useState(1)
  const [notas, setNotas] = useState({})
  const [craque, setCraque] = useState(null)
  const [bagre, setBagre] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feito, setFeito] = useState(false)
  const [participacao, setParticipacao] = useState(null)

  // `vivo` evita escrever estado depois de o ecrã sair — sair da votação a
  // meio do carregamento deixava a resposta a chegar a um componente morto.
  const carregar = useCallback(
    async (vivo = { atual: true }) => {
      setErro('')
      try {
        const c = await getRoundBallot(session.id, session.pin, matchId, token)
        if (!vivo.atual) return
        setCedula(c)
        setParticipacao(c?.participacao || null)
        const n = {}
        for (const t of c?.teammates || []) if (Number.isInteger(t.stars)) n[t.player_id] = t.stars
        setNotas(n)
        // Quem já votou no prémio entra direto nas estrelas que lhe faltam —
        // repetir-lhe os passos 2 e 3 só para os ver bloqueados era perder o
        // minuto que este ecrã promete poupar.
        if (c?.already_voted_award && (c?.teammates || []).length) setPasso(1)
      } catch (e) {
        if (vivo.atual) setErro(e.message)
      }
    },
    [session.id, session.pin, matchId, token]
  )

  useEffect(() => {
    const vivo = { atual: true }
    ;(async () => {
      await carregar(vivo)
    })()
    return () => {
      vivo.atual = false
    }
  }, [carregar])

  const votacao = useMemo(() => estadoDaVotacao(cedula), [cedula])
  const companheiros = cedula?.teammates || []
  const jaVotouPremio = Boolean(cedula?.already_voted_award)
  const dadas = companheiros.filter((c) => Number.isInteger(notas[c.player_id])).length

  // Um jogo sem equipas atribuídas não tem companheiros para avaliar: a
  // cédula passa a ter 2 passos em vez de 3, em vez de mostrar um passo
  // vazio que ninguém sabe o que fazer com ele.
  const passos = useMemo(() => {
    const lista = []
    if (companheiros.length) lista.push(PASSOS[0])
    if (!jaVotouPremio) lista.push(PASSOS[1], PASSOS[2])
    return lista
  }, [companheiros.length, jaVotouPremio])

  const indice = Math.max(0, passos.findIndex((p) => p.id === passo))
  const atual = passos[indice] || passos[0]
  const ultimo = indice >= passos.length - 1

  const mesmo = craque && bagre && craque === bagre
  const premioPronto = jaVotouPremio || (craque && bagre && !mesmo)
  const algoParaEnviar = dadas > 0 || (!jaVotouPremio && premioPronto)

  const enviar = async () => {
    if (busy || !algoParaEnviar) return
    setErro('')
    setBusy(true)
    try {
      const r = await submitRoundVote(
        session.id,
        session.pin,
        matchId,
        {
          craqueId: jaVotouPremio ? null : craque,
          bagreId: jaVotouPremio ? null : bagre,
          ratings: companheiros
            .filter((c) => Number.isInteger(notas[c.player_id]))
            .map((c) => ({ player_id: c.player_id, stars: notas[c.player_id] })),
        },
        token
      )
      setParticipacao(r?.participacao || null)
      setFeito(true)
      onVotado?.()
    } catch (e) {
      // votou entretanto noutro telemóvel: não é erro, é estar em dia
      if (e.code === 'VOTOFEITO') {
        setFeito(true)
        onVotado?.()
      } else setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- estados fora do fluxo normal ----------

  if (erro && !cedula) {
    return (
      <Moldura onSair={onSair}>
        <ErrorBox>{erro}</ErrorBox>
        <button type="button" onClick={onSair} style={{ ...styles.buttonGhost, marginTop: 14 }}>
          Ir para a página inicial
        </button>
      </Moldura>
    )
  }

  if (!cedula) {
    return (
      <Moldura onSair={onSair}>
        <SkeletonCard lines={4} />
      </Moldura>
    )
  }

  const placar = `${cedula.team_a_name || 'Time A'} ${cedula.score_a ?? 0} x ${cedula.score_b ?? 0} ${cedula.team_b_name || 'Time B'}`

  if (!cedula.me?.jogou) {
    return (
      <Moldura onSair={onSair} titulo={placar} subtitulo={formatDia(cedula.played_at)}>
        <div className="pb-card" style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>
            👀
          </div>
          <p style={{ fontSize: 15, marginBottom: 6 }}>Só quem jogou esta rodada é que vota.</p>
          <p style={styles.mutedText}>Mas podes ver como acabou.</p>
          <button type="button" onClick={onSair} style={{ ...styles.button, marginTop: 16 }}>
            Ver a rodada
          </button>
        </div>
      </Moldura>
    )
  }

  if (!votacao.aberta && !feito) {
    return (
      <Moldura onSair={onSair} titulo={placar} subtitulo={formatDia(cedula.played_at)}>
        <div className="pb-card" style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>
            {votacao.emRevisao ? '⚠️' : '🔒'}
          </div>
          <p style={{ fontSize: 15, marginBottom: 6 }}>
            {votacao.emRevisao
              ? 'Esta votação está em revisão pelo admin.'
              : 'A votação desta rodada já fechou.'}
          </p>
          <p style={styles.mutedText}>
            {votacao.deadline ? `Fechou ${prazoLegivel(votacao.deadline)}.` : ''}
          </p>
          <button type="button" onClick={onSair} style={{ ...styles.button, marginTop: 16 }}>
            Ver o resultado
          </button>
        </div>
      </Moldura>
    )
  }

  // Já votou no prémio E já avaliou toda a gente. Acontece a quem abre o
  // link uma segunda vez — sem este ramo ficava com uma cédula vazia e um
  // botão "Enviar" desativado, sem perceber porquê.
  if (!feito && !passos.length) {
    return (
      <Moldura onSair={onSair} titulo={placar} subtitulo={formatDia(cedula.played_at)}>
        <div className="pb-card" style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ fontSize: 34 }} aria-hidden>
            ✅
          </div>
          <div style={{ ...styles.title, fontSize: 18, marginTop: 8 }}>Já votaste em tudo</div>
          <p style={{ ...styles.mutedText, marginTop: 8, fontSize: 14 }}>
            Nesta rodada não tens mais nada por dar. Obrigado! 👏
          </p>
          {participacao && (
            <div style={{ marginTop: 14 }}>
              <Barra votantes={participacao.votantes} total={participacao.total} />
            </div>
          )}
          <button
            type="button"
            onClick={() => navegarPara(ROTAS.JOGO, matchId, { substituir: true })}
            style={{ ...styles.button, marginTop: 16 }}
          >
            Ver o resultado da rodada
          </button>
        </div>
      </Moldura>
    )
  }

  if (feito) {
    const faltam = participacao ? Math.max(0, participacao.total - participacao.votantes) : 0
    return (
      <Moldura onSair={onSair} titulo={placar} subtitulo={formatDia(cedula.played_at)}>
        <div className="pb-card" style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ fontSize: 40 }} aria-hidden>
            🎉
          </div>
          <div style={{ ...styles.title, fontSize: 20, marginTop: 8 }}>Votado!</div>
          <p style={{ ...styles.mutedText, marginTop: 8, fontSize: 14 }}>
            {faltam > 0
              ? `Faltam ${faltam} ${faltam === 1 ? 'pessoa' : 'pessoas'} para fechar a votação.`
              : 'Já votou toda a gente que jogou. 👏'}
          </p>
          {participacao && <Barra votantes={participacao.votantes} total={participacao.total} />}
          <button
            type="button"
            onClick={() => navegarPara(ROTAS.JOGO, matchId, { substituir: true })}
            style={{ ...styles.button, marginTop: 16 }}
          >
            Ver o resultado da rodada
          </button>
          <button type="button" onClick={onSair} style={{ ...styles.buttonGhost, marginTop: 10 }}>
            Página inicial
          </button>
        </div>
      </Moldura>
    )
  }

  // ---------- a cédula ----------

  return (
    <Moldura onSair={onSair} titulo={placar} subtitulo={formatDia(cedula.played_at)}>
      {votacao.deadline && (
        <p
          style={{
            ...styles.mutedText,
            fontSize: 13,
            textAlign: 'center',
            marginBottom: 12,
            color: votacao.tempo.urgente ? colors.teamA : colors.muted,
          }}
        >
          ⏰ {votacao.tempo.urgente ? 'Fecha em breve' : 'Fecha'} {prazoLegivel(votacao.deadline)}
          {votacao.tempo.conhecido && !votacao.tempo.expirado ? ` · faltam ${votacao.tempo.texto}` : ''}
        </p>
      )}

      <Progresso passo={indice + 1} total={passos.length} />

      <div className="pb-card">
        <div style={{ ...styles.title, fontSize: 17, marginBottom: 4 }}>
          {atual?.icone} {atual?.titulo}
        </div>

        {/* ---------- estrelas ---------- */}
        {atual?.id === 1 && (
          <>
            <p style={{ ...styles.mutedText, fontSize: 13 }}>
              Dá nota a quem jogou contigo. É <strong>anónimo</strong> — cada um só vê a média que
              recebeu.
            </p>
            <p
              style={{
                fontFamily: fonts.title,
                color: dadas === companheiros.length ? colors.grass : colors.muted,
                letterSpacing: 1,
                margin: '12px 0 2px',
                fontSize: 14,
              }}
            >
              {dadas}/{companheiros.length} avaliados
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {companheiros.map((c) => (
                <div key={c.player_id} style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.name} photo={c.photo} size={36} />
                    <span
                      className="pb-truncate"
                      style={{ flex: 1, fontSize: 15, fontWeight: 600, minWidth: 0 }}
                    >
                      {c.name}
                    </span>
                  </div>
                  <StarPicker
                    nome={c.name}
                    valor={notas[c.player_id]}
                    onChange={(v) => setNotas((n) => ({ ...n, [c.player_id]: v }))}
                  />
                  <StarLegend valor={notas[c.player_id]} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- craque ---------- */}
        {atual?.id === 2 && (
          <>
            <p style={{ ...styles.mutedText, fontSize: 13 }}>
              {cedula.score_a === cedula.score_b
                ? '🤝 Deu empate — não há vencedor nem derrotado, por isso concorre toda a gente que jogou.'
                : 'O craque sai de quem venceu o jogo.'}
            </p>
            <Escolha
              opcoes={cedula.craque_candidates || []}
              valor={craque}
              cor={colors.teamA}
              onEscolher={setCraque}
              vazio="Não há candidatos a craque nesta rodada."
            />
          </>
        )}

        {/* ---------- bagre ---------- */}
        {atual?.id === 3 && (
          <>
            <p style={{ ...styles.mutedText, fontSize: 13 }}>
              {cedula.score_a === cedula.score_b
                ? '🤝 Empate: concorre toda a gente que jogou.'
                : 'O bagre sai de quem perdeu o jogo. Sem ressentimentos. 😄'}
            </p>
            <Escolha
              opcoes={cedula.bagre_candidates || []}
              valor={bagre}
              cor={colors.teamB}
              onEscolher={setBagre}
              vazio="Não há candidatos a bagre nesta rodada."
            />
            {mesmo && (
              <p style={styles.errorText}>O craque e o bagre não podem ser o mesmo jogador.</p>
            )}
          </>
        )}

        {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {indice > 0 && (
            <button
              type="button"
              onClick={() => setPasso(passos[indice - 1].id)}
              style={{ ...styles.buttonGhost, flex: '1 1 110px', width: 'auto' }}
            >
              ← Voltar
            </button>
          )}
          {!ultimo ? (
            <button
              type="button"
              onClick={() => setPasso(passos[indice + 1].id)}
              style={{ ...styles.button, flex: '2 1 170px', width: 'auto' }}
            >
              Seguinte →
            </button>
          ) : (
            <button
              type="button"
              onClick={enviar}
              disabled={busy || !algoParaEnviar || mesmo}
              style={
                busy || !algoParaEnviar || mesmo
                  ? disabled({ ...styles.button, flex: '2 1 170px', width: 'auto' })
                  : { ...styles.button, flex: '2 1 170px', width: 'auto' }
              }
            >
              {busy ? 'A enviar…' : '✅ Enviar o meu voto'}
            </button>
          )}
        </div>

        {/* Sair a meio não pode custar o que já se fez: o servidor aceita
            envios parciais e este botão é o que o torna visível. */}
        {!ultimo && dadas > 0 && (
          <button
            type="button"
            onClick={enviar}
            disabled={busy}
            style={{ ...styles.link, width: '100%', marginTop: 10 }}
          >
            Guardar o que já fiz e sair
          </button>
        )}
      </div>

      {participacao?.total > 0 && (
        <div className="pb-card" style={{ marginTop: 12 }}>
          <Barra votantes={participacao.votantes} total={participacao.total} />
        </div>
      )}
    </Moldura>
  )
}

function Barra({ votantes, total }) {
  const pct = total > 0 ? Math.round((votantes / total) * 100) : 0
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: colors.muted,
          marginBottom: 6,
        }}
      >
        <span>🗳️ Já votaram</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {votantes}/{total}
        </span>
      </div>
      <div style={{ height: 8, background: '#0C1915', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: pct >= 70 ? colors.grass : colors.teamA,
            borderRadius: 999,
            transition: 'width .3s',
          }}
        />
      </div>
    </div>
  )
}

function Moldura({ children, onSair, titulo, subtitulo }) {
  return (
    <div style={{ ...styles.page, maxWidth: 560 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...styles.title, fontSize: 20 }}>
            🗳️ Votação da rodada
          </h1>
          {titulo && (
            <p className="pb-truncate" style={{ fontSize: 14, marginTop: 4 }}>
              {titulo}
            </p>
          )}
          {subtitulo && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 2 }}>{subtitulo}</p>
          )}
        </div>
        <button onClick={onSair} style={{ ...styles.link, flexShrink: 0 }}>
          Sair
        </button>
      </div>
      {children}
    </div>
  )
}

export { Barra as BarraDeParticipacao }
