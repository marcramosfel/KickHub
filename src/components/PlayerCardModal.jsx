import { useMemo, useState } from 'react'
import { setMyNickname, setMyPrimaryCard } from '../api'
import { atributosComDados, calcularAtributos, ehGoleiro, overallDoCard } from '../lib/attributes'
import { CARD_BASE, cardPrincipal, cardsDoJogador, cardsEscolhiveis, raridade } from '../lib/cards'
import { ICONE } from '../lib/icones'
import { nomeDaPosicao, siglaDaPosicao, iconeDaPosicao } from '../lib/positions'
import { dadosDoCard, descarregarCard, partilharCard, renderPlayerCard } from '../lib/card'
import { useModal } from '../hooks/useModal'
import Avatar from './Avatar'
import AchievementFrame from './AchievementFrame'
import { ErrorBox } from './Ui'
import { colors, fonts, styles, chip } from '../theme'

// O card do jogador, ao estilo dos jogos de futebol.
//
// Abre ao tocar na foto ou no nome de qualquer jogador, em qualquer ecrã.
// No telemóvel sobe de baixo (bottom sheet), no computador é um modal —
// as duas coisas já vêm do `.pb-sheet` do layout.css e do `useModal`, que
// trata do foco, do Escape e da tranca do scroll.
//
// Três separadores: o CARD (atributos e números), a COLEÇÃO (todos os cards
// conquistados, com o porquê de cada um) e, para o próprio, o que ele pode
// mudar — apelido e qual o card que quer exibir.

const ABAS = [
  { id: 'card', rotulo: '🎴 Card' },
  { id: 'colecao', rotulo: '🏅 Coleção' },
]

// Barra 0–99 de um atributo. Sem dados mostra "—" e diz porquê no title —
// nunca um número inventado.
function Atributo({ a }) {
  const temDados = a.valor != null
  const cor = !temDados ? colors.line : a.valor >= 75 ? colors.grass : a.valor >= 50 ? colors.teamA : colors.muted
  return (
    <div title={temDados ? a.desc : `${a.desc} — ainda sem dados suficientes`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: fonts.title, fontSize: 11, letterSpacing: 1, color: colors.muted }}>
          {a.id}
        </span>
        <span
          style={{
            fontFamily: fonts.title,
            fontSize: 16,
            fontWeight: 700,
            color: temDados ? colors.text : colors.muted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {temDados ? a.valor : '—'}
        </span>
      </div>
      <div style={{ height: 4, background: '#0C1915', borderRadius: 999, overflow: 'hidden', marginTop: 3 }}>
        <div
          style={{
            height: '100%',
            width: temDados ? `${a.valor}%` : '100%',
            background: cor,
            opacity: temDados ? 1 : 0.25,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  )
}

// Um número da grelha. O ícone vai POR CIMA e não colado ao rótulo: com oito
// células numa linha de 375px, "⚽ GOLS" partia em duas linhas em metade
// delas e a grelha ficava com alturas diferentes.
function Numero({ icone, rotulo, valor, cor }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div aria-hidden style={{ fontSize: 13, lineHeight: 1.2 }}>
        {icone}
      </div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 20,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: cor,
        }}
      >
        {valor ?? '—'}
      </div>
      <div
        className="pb-truncate"
        style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.5 }}
      >
        {rotulo}
      </div>
    </div>
  )
}

// Etiqueta de raridade; tocar mostra porque é que este card foi desbloqueado.
function Raridade({ card, aberto, onAlternar }) {
  const r = raridade(card.raridade)
  return (
    <div style={{ textAlign: 'center' }}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        style={{ ...chip(r.cor, `${r.cor}1A`), border: `1px solid ${r.cor}55`, cursor: 'pointer' }}
      >
        {card.icon} {r.nome} · porquê?
      </button>
      {aberto && (
        <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
          {card.motivo || card.descricao}
        </p>
      )}
    </div>
  )
}

export default function PlayerCardModal({
  jogador,
  liderancas,
  sequencias,
  totalRodadas = 0,
  session,
  onPedirPin,
  onFechar,
  onVerPerfil,
  onAtualizado,
}) {
  const { ref, aoClicarNoFundo } = useModal(Boolean(jogador), onFechar)
  const [aba, setAba] = useState('card')
  const [porque, setPorque] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [apelido, setApelido] = useState(jogador?.nickname || '')

  const cards = useMemo(
    () => cardsDoJogador({ jogador, liderancas, sequencias, totalRodadas }),
    [jogador, liderancas, sequencias, totalRodadas]
  )
  const principal = useMemo(
    () => cardPrincipal(cards, jogador?.primaryCard),
    [cards, jogador?.primaryCard]
  )
  const atributos = useMemo(
    () => calcularAtributos(jogador, totalRodadas),
    [jogador, totalRodadas]
  )

  if (!jogador) return null

  const souEu = session?.id === jogador.id
  const gk = ehGoleiro(jogador)
  const overall = overallDoCard(jogador)
  const comDados = atributosComDados(atributos)
  const escolhiveis = cardsEscolhiveis(cards)

  const avisar = (m) => {
    setAviso(m)
    setTimeout(() => setAviso(''), 2500)
  }

  const guardar = async (fn, mensagem) => {
    if (busy) return
    setBusy(true)
    setErro('')
    try {
      await fn()
      await onAtualizado?.()
      avisar(mensagem)
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Numa sessão vinda do "lembrar-me" não há PIN em memória (o token só
  // autoriza ler e votar) — pede-se uma vez, em vez de falhar com um erro
  // de credenciais que não faz sentido a quem não escreveu nenhum PIN.
  const comPin = async (motivo) => session.pin || (await onPedirPin?.(motivo)) || null

  const escolherCard = async (cardId) => {
    const pin = await comPin('Vais escolher o teu card principal.')
    if (!pin) return
    guardar(
      () => setMyPrimaryCard(session.id, pin, cardId),
      cardId ? 'Card principal atualizado!' : 'Voltou ao automático.'
    )
  }

  const guardarApelido = async () => {
    const pin = await comPin('Vais mudar o teu apelido.')
    if (!pin) return
    guardar(() => setMyNickname(session.id, pin, apelido), 'Apelido guardado!')
  }

  const partilhar = async () => {
    avisar('A gerar…')
    try {
      const dataUrl = await renderPlayerCard(
        dadosDoCard({ jogador, card: principal, totalRodadas })
      )
      const r = await partilharCard(dataUrl, jogador.name)
      if (r !== 'cancelado') avisar(r === 'partilhado' ? 'Partilhado!' : 'Imagem gerada!')
    } catch {
      setErro('Não consegui gerar a imagem do card.')
    }
  }

  const baixar = async () => {
    try {
      const dataUrl = await renderPlayerCard(
        dadosDoCard({ jogador, card: principal, totalRodadas })
      )
      descarregarCard(dataUrl, jogador.name)
      avisar('Card descarregado!')
    } catch {
      setErro('Não consegui gerar a imagem do card.')
    }
  }

  const posicaoPrincipal = gk ? 'GK' : jogador.primaryPosition
  const cor = raridade(principal?.raridade).cor

  return (
    <div className="pb-overlay" onClick={aoClicarNoFundo}>
      <div
        ref={ref}
        className="pb-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Card de ${jogador.name}`}
      >
        <div className="pb-sheet-handle" aria-hidden />

        {erro && <ErrorBox style={{ marginBottom: 10 }}>{erro}</ErrorBox>}
        {aviso && (
          <p role="status" style={{ color: colors.grass, fontSize: 13, margin: '0 0 10px' }}>
            ✅ {aviso}
          </p>
        )}

        {/* ---------- o card ---------- */}
        <AchievementFrame titulo={principal?.id === CARD_BASE.id ? null : principal} tamanho="lg">
          <div
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'center',
              padding: 14,
              background: principal?.moldura?.fundo || colors.panel,
              borderRadius: 14,
            }}
          >
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: fonts.title,
                  fontSize: 40,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: cor,
                }}
              >
                {overall ?? '—'}
              </div>
              <div style={{ fontSize: 10, letterSpacing: 1, color: colors.muted }}>OVERALL</div>
              {posicaoPrincipal && (
                <div
                  title={nomeDaPosicao(posicaoPrincipal)}
                  style={{ fontFamily: fonts.title, fontSize: 13, marginTop: 6, color: colors.text }}
                >
                  {iconeDaPosicao(posicaoPrincipal)} {siglaDaPosicao(posicaoPrincipal)}
                </div>
              )}
              {jogador.secondaryPosition && !gk && (
                <div
                  title={`Posição secundária: ${nomeDaPosicao(jogador.secondaryPosition)}`}
                  style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}
                >
                  2.ª {siglaDaPosicao(jogador.secondaryPosition)}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <Avatar name={jogador.name} photo={jogador.photo} size={78} />
              <div
                className="pb-truncate"
                style={{ fontFamily: fonts.title, fontSize: 18, marginTop: 6 }}
              >
                {jogador.name}
              </div>
              {jogador.nickname && (
                <div className="pb-truncate" style={{ fontSize: 12, color: colors.muted }}>
                  “{jogador.nickname}”
                </div>
              )}
            </div>
          </div>
        </AchievementFrame>

        <div style={{ marginTop: 10 }}>
          <Raridade card={principal} aberto={porque} onAlternar={() => setPorque((v) => !v)} />
        </div>

        {/* ---------- separadores ---------- */}
        <div style={{ display: 'flex', gap: 4, margin: '14px 0 10px' }}>
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              aria-pressed={aba === a.id}
              className="pb-tab"
              style={{
                flex: 1,
                justifyContent: 'center',
                fontSize: 13,
                background: aba === a.id ? 'rgba(52,208,88,0.14)' : 'transparent',
                color: aba === a.id ? colors.text : colors.muted,
              }}
            >
              {a.rotulo}
              {a.id === 'colecao' && escolhiveis.length > 0 ? ` (${escolhiveis.length})` : ''}
            </button>
          ))}
        </div>

        {aba === 'card' && (
          <>
            {comDados === 0 ? (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                Ainda sem dados suficientes para os atributos — faltam jogos e votos. Os números
                aparecem sozinhos à medida que {souEu ? 'jogas' : 'ele joga'}.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                }}
              >
                {atributos.map((a) => (
                  <Atributo key={a.id} a={a} />
                ))}
              </div>
            )}

            {/* `auto-fit` e não quatro colunas fixas: o autogolo só aparece a
                quem tem algum, e com colunas fixas a grelha passava de duas
                linhas certinhas para uma última linha com uma célula solta. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(74px, 100%), 1fr))',
                gap: 8,
                marginTop: 14,
                paddingTop: 12,
                borderTop: `1px solid ${colors.line}`,
              }}
            >
              <Numero icone={ICONE.jogos} rotulo="JOGOS" valor={jogador.matches} />
              {gk ? (
                <>
                  <Numero icone={ICONE.defesas} rotulo="DEFESAS" valor={jogador.saves} />
                  <Numero
                    icone={ICONE.semSofrer}
                    rotulo="SEM SOFRER"
                    valor={jogador.cleanSheets}
                  />
                </>
              ) : (
                <>
                  <Numero icone={ICONE.gols} rotulo="GOLS" valor={jogador.goals} />
                  <Numero icone={ICONE.assistencias} rotulo="ASSIST." valor={jogador.assists} />
                  {/* Só a quem tem: uma coluna de zeros em trinta jogadores
                      não diz nada, e um autogolo é para se notar. */}
                  {jogador.ownGoals > 0 && (
                    <Numero
                      icone={ICONE.autogolos}
                      rotulo="AUTOGOLOS"
                      valor={jogador.ownGoals}
                      cor={colors.muted}
                    />
                  )}
                </>
              )}
              <Numero icone={ICONE.craque} rotulo="CRAQUE" valor={jogador.craques} cor={colors.teamA} />
              <Numero icone={ICONE.vitorias} rotulo="VITÓRIAS" valor={jogador.wins} cor={colors.grass} />
              <Numero icone={ICONE.empates} rotulo="EMPATES" valor={jogador.draws} />
              <Numero icone={ICONE.derrotas} rotulo="DERROTAS" valor={jogador.losses} />
              <Numero icone={ICONE.bagre} rotulo="BAGRE" valor={jogador.bagres} cor={colors.teamB} />
            </div>
          </>
        )}

        {aba === 'colecao' && (
          <div className="pb-stack-sm pb-stagger">
            {escolhiveis.length === 0 ? (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                Ainda sem cards conquistados. Todos começam com o card de jogador da pelada — os
                outros vêm com os gols, as assistências e as vitórias.
              </p>
            ) : (
              escolhiveis.map((c) => {
                const r = raridade(c.raridade)
                const ativo = principal?.id === c.id
                // "Em uso" e "escolhido à mão" não são a mesma coisa: sem
                // escolha, o card em uso é só o mais raro que ele tem, e o
                // dia em que perder a artilharia o card muda sozinho. Dizer
                // qual é qual é o que torna o botão compreensível.
                const escolhidoAMao = jogador.primaryCard === c.id
                const brilha = c.raridade === 'lendario' || c.raridade === 'epico'
                return (
                  <div
                    key={c.id}
                    className={brilha ? 'pb-shine' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      borderRadius: 12,
                      border: `1px solid ${ativo ? r.cor : colors.line}`,
                      background: ativo ? `${r.cor}0F` : 'transparent',
                      boxShadow: ativo && r.brilho ? `0 0 18px ${r.brilho}` : undefined,
                      transition: 'border-color 200ms ease, background-color 200ms ease',
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 22, flexShrink: 0 }}>
                      {c.icon}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        className="pb-truncate"
                        style={{ display: 'block', fontFamily: fonts.title, fontSize: 14, color: r.cor }}
                      >
                        {c.titulo}
                        {escolhidoAMao && (
                          <span style={{ color: colors.grass, fontSize: 12 }}> ★</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: colors.muted, display: 'block' }}>
                        {r.nome} · {c.motivo}
                      </span>
                    </span>
                    {souEu && (
                      <button
                        type="button"
                        onClick={() => escolherCard(escolhidoAMao ? null : c.id)}
                        disabled={busy}
                        className="pb-tab pb-tap"
                        title={
                          escolhidoAMao
                            ? 'Voltar ao automático (mostra sempre o mais raro que tiveres)'
                            : 'Passar a mostrar este card a toda a gente'
                        }
                        style={{
                          fontSize: 12,
                          flexShrink: 0,
                          color: escolhidoAMao ? colors.grass : undefined,
                        }}
                      >
                        {escolhidoAMao ? '★ O teu' : ativo ? 'Fixar' : 'Usar'}
                      </button>
                    )}
                  </div>
                )
              })
            )}

            {souEu && escolhiveis.length > 1 && (
              <p style={{ ...styles.mutedText, fontSize: 11 }}>
                O card marcado com ★ é o que escolheste — é esse que o grupo vê no teu perfil e no
                ranking. Sem escolha, mostra-se sempre o mais raro que tiveres nesse momento.
              </p>
            )}

            {souEu && (
              <div style={{ paddingTop: 10, borderTop: `1px solid ${colors.line}` }}>
                <label style={styles.label} htmlFor="apelido-card">
                  O teu apelido no card (máx. 18)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="apelido-card"
                    style={{ ...styles.input, flex: 1 }}
                    value={apelido}
                    maxLength={18}
                    onChange={(e) => setApelido(e.target.value)}
                    placeholder="Ex.: Pé de Anjo"
                  />
                  <button
                    type="button"
                    onClick={guardarApelido}
                    disabled={busy}
                    className="pb-tab"
                    style={{ fontSize: 13, flexShrink: 0 }}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- ações ---------- */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" onClick={partilhar} className="pb-tab" style={{ fontSize: 13 }}>
            📤 Partilhar
          </button>
          <button type="button" onClick={baixar} className="pb-tab" style={{ fontSize: 13 }}>
            ⬇️ Baixar
          </button>
          {onVerPerfil && (
            <button
              type="button"
              onClick={() => {
                onFechar?.()
                onVerPerfil(jogador.id)
              }}
              className="pb-tab"
              style={{ fontSize: 13 }}
            >
              Ver perfil completo
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="pb-tab"
            style={{ fontSize: 13, marginLeft: 'auto', color: colors.muted }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
