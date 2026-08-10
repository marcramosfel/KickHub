import { separarEscalacao } from '../../lib/goleiros'
import { nomeDaEquipa, corDaEquipa } from '../../lib/substitutions'
import Avatar from '../Avatar'
import Stepper from './Stepper'
import { colors, styles } from '../../theme'

// Os números de um jogo, por jogador. UM formulário, dois pontos de entrada.
//
// Existia duas vezes: no `GameDetail` (jogo agendado, escalação sorteada) e
// no `RodadasPanel` (rodada antiga, plantel inteiro com caixas de presença).
// Eram listas com a mesma finalidade e comportamentos diferentes — o
// autogolo teria de nascer duas vezes, e a regra do goleiro já tinha
// divergido entre os dois.
//
// A diferença real entre os dois casos é só uma: de onde vem a lista de
// jogadores.
//
//   COM escalação  as equipas estão decididas pelo sorteio; ninguém se
//                  acrescenta aqui (isso é uma substituição, e tem ecrã
//                  próprio com auditoria).
//   SEM escalação  a rodada nunca passou pelo agendamento: a lista é o
//                  plantel e é aqui que se marca quem jogou e por que
//                  equipa.
//
// A régua do goleiro é a mesma nos dois: `separarEscalacao` (lib/goleiros).

// ---------- uma linha ----------
function LinhaJogador({
  id,
  nome,
  foto,
  goleiroFixo,
  stats,
  gk,
  onStat,
  onGk,
  podeMarcarGoleiro,
  extra,
}) {
  return (
    <div style={{ padding: '7px 0', borderBottom: `1px solid ${colors.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={nome} photo={foto} size={26} />
        <span className="pb-truncate" style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
          {nome}
        </span>
        {extra}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 14,
          rowGap: 8,
          marginTop: 8,
          paddingLeft: 34,
          flexWrap: 'wrap',
        }}
      >
        {/* Um goleiro fixo não se mede por gols; toda a gente o resto sim,
            incluindo quem só COMEÇOU no gol num jogo de rodízio. */}
        {!goleiroFixo && (
          <>
            <Stepper
              icon="⚽"
              label={`gols de ${nome}`}
              value={stats?.goals || 0}
              onChange={(v) => onStat(id, 'goals', v)}
            />
            <Stepper
              icon="🅰️"
              label={`assistências de ${nome}`}
              value={stats?.assists || 0}
              onChange={(v) => onStat(id, 'assists', v)}
            />
            {/* Autogolo. Conta-se à parte e nunca soma aos gols do jogador —
                nem aqui, nem no ranking, nem no overall. */}
            <Stepper
              icon="🥅"
              label={`autogolos de ${nome}`}
              value={stats?.own || 0}
              onChange={(v) => onStat(id, 'own', v)}
            />
          </>
        )}

        {/* Quem esteve mesmo na baliza leva defesas e gols sofridos. Nos
            goleiros fixos é automático; nos outros é uma marca à mão, senão
            metade da pelada entrava no ranking de goleiros por ter passado
            dez minutos lá. */}
        {podeMarcarGoleiro && (
          <button
            type="button"
            onClick={() => onGk(id, 'alternar')}
            aria-pressed={!!gk}
            title="Registar defesas e gols sofridos deste jogador"
            style={{
              ...styles.link,
              color: gk ? colors.teamB : colors.muted,
              textDecoration: 'none',
              border: `1px solid ${gk ? colors.teamB : colors.line}`,
              borderRadius: 8,
              padding: '3px 9px',
              fontSize: 12,
            }}
          >
            🧤 {gk ? 'Esteve na baliza' : 'esteve na baliza?'}
          </button>
        )}

        {gk && (
          <>
            <Stepper
              icon="🧤"
              label={`defesas de ${nome}`}
              value={gk.saves || 0}
              onChange={(v) => onGk(id, 'saves', v)}
            />
            <Stepper
              icon="🥅"
              label={`gols sofridos por ${nome}`}
              value={gk.conceded || 0}
              onChange={(v) => onGk(id, 'conceded', v)}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ---------- botões A / B ----------
function EscolhaDeEquipa({ valor, onEscolher }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {['A', 'B'].map((t) => {
        const on = valor === t
        const cor = corDaEquipa(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => onEscolher(on ? null : t)}
            aria-label={`${nomeDaEquipa(t)}`}
            aria-pressed={on}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${on ? cor : colors.line}`,
              background: on ? cor : '#0C1915',
              color: on ? '#06130D' : colors.muted,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

export default function ResultadoForm({
  jogo,
  escalacao = [],
  plantel = [],
  form,
  onStat,
  onGk,
  onJogou,
}) {
  const comEscalacao = escalacao.length > 0
  const { linha, baliza, rotativo } = separarEscalacao(jogo, escalacao)

  // ---------- rodada agendada: duas colunas, uma por equipa ----------
  if (comEscalacao) {
    return (
      <>
        <div className="pb-split" style={{ '--pb-split-min': '400px' }}>
          {['A', 'B'].map((lado) => {
            const lista = linha.filter((l) => l.team === lado)
            if (!lista.length) return null
            return (
              <div key={lado} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: corDaEquipa(lado),
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  {nomeDaEquipa(lado)}
                </div>
                {lista.map((l) => (
                  <LinhaJogador
                    key={l.player_id}
                    id={l.player_id}
                    nome={l.name}
                    foto={l.photo}
                    goleiroFixo={false}
                    stats={form.stats[l.player_id]}
                    gk={form.gk[l.player_id]}
                    onStat={onStat}
                    onGk={onGk}
                    // no rodízio qualquer um pode ter ido à baliza
                    podeMarcarGoleiro={rotativo}
                    extra={
                      l.is_goalkeeper ? (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: 11,
                            color: colors.muted,
                            border: `1px solid ${colors.line}`,
                            borderRadius: 999,
                            padding: '2px 8px',
                          }}
                          title="Começou o jogo na baliza — é a vez 1 do rodízio, não é goleiro fixo"
                        >
                          🧤 começou no gol
                        </span>
                      ) : null
                    }
                  />
                ))}
              </div>
            )
          })}
        </div>

        {rotativo && (
          <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 12 }}>
            🔄 Jogo sem goleiro fixo: quem começou no gol conta como jogador normal e pode receber
            gols, assistências e autogolos. Marca “esteve na baliza” só a quem queiras registar
            defesas.
          </p>
        )}

        {baliza.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 12,
                color: colors.muted,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              🧤 Goleiros
            </div>
            <div className="pb-split" style={{ '--pb-split-min': '400px' }}>
              {baliza.map((g) => (
                <LinhaJogador
                  key={g.player_id}
                  id={g.player_id}
                  nome={g.name}
                  foto={g.photo}
                  goleiroFixo
                  stats={form.stats[g.player_id]}
                  gk={form.gk[g.player_id] || { saves: 0, conceded: 0 }}
                  onStat={onStat}
                  onGk={onGk}
                  podeMarcarGoleiro={false}
                />
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  // ---------- rodada antiga: o plantel, com presenças ----------
  return (
    <>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 6 }}>
        Esta rodada não passou pelo sorteio, por isso é aqui que se marca quem jogou e por que
        equipa. Gols ⚽, assistências 🅰️ e autogolos 🥅 por jogador; quem esteve na baliza leva
        🧤 defesas e gols sofridos.
      </p>
      <div className="pb-split" style={{ '--pb-split-min': '440px' }}>
        {plantel.map((p) => {
          const marcado = !!form.jogou[p.id]
          return (
            <div key={p.id} style={{ padding: '4px 0', borderBottom: `1px solid ${colors.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* A caixa e o nome são o mesmo alvo de toque: marcar
                    presenças é o gesto mais repetido desta página. */}
                <label
                  htmlFor={`jogou-${p.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    padding: '8px 0',
                  }}
                >
                  <input
                    id={`jogou-${p.id}`}
                    type="checkbox"
                    checked={marcado}
                    onChange={(e) => onJogou(p.id, e.target.checked)}
                    style={{ width: 20, height: 20, flexShrink: 0, accentColor: colors.grass }}
                  />
                  <Avatar name={p.name} photo={p.photo_url || p.photo} size={28} />
                  <span className="pb-truncate" style={{ flex: 1, fontSize: 14, minWidth: 0 }}>
                    {p.name}
                  </span>
                </label>
                {marcado && (
                  <EscolhaDeEquipa
                    valor={form.stats[p.id]?.team || null}
                    onEscolher={(t) => onStat(p.id, 'team', t)}
                  />
                )}
              </div>
              {marcado && (
                <LinhaSemCabecalho
                  id={p.id}
                  nome={p.name}
                  stats={form.stats[p.id]}
                  gk={form.gk[p.id]}
                  onStat={onStat}
                  onGk={onGk}
                />
              )}
            </div>
          )
        })}
      </div>
      {plantel.length === 0 && <p style={styles.mutedText}>Sem jogadores aprovados.</p>}
    </>
  )
}

// A mesma fila de contadores da `LinhaJogador`, sem repetir o avatar e o nome
// (na lista do plantel eles já estão na linha da caixa de presença).
function LinhaSemCabecalho({ id, nome, stats, gk, onStat, onGk }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        rowGap: 8,
        margin: '2px 0 8px',
        paddingLeft: 34,
        flexWrap: 'wrap',
      }}
    >
      <Stepper
        icon="⚽"
        label={`gols de ${nome}`}
        value={stats?.goals || 0}
        onChange={(v) => onStat(id, 'goals', v)}
      />
      <Stepper
        icon="🅰️"
        label={`assistências de ${nome}`}
        value={stats?.assists || 0}
        onChange={(v) => onStat(id, 'assists', v)}
      />
      <Stepper
        icon="🥅"
        label={`autogolos de ${nome}`}
        value={stats?.own || 0}
        onChange={(v) => onStat(id, 'own', v)}
      />
      <button
        type="button"
        onClick={() => onGk(id, 'alternar')}
        aria-pressed={!!gk}
        title="Registar defesas e gols sofridos deste jogador"
        style={{
          ...styles.link,
          color: gk ? colors.teamB : colors.muted,
          textDecoration: 'none',
          border: `1px solid ${gk ? colors.teamB : colors.line}`,
          borderRadius: 8,
          padding: '3px 9px',
          fontSize: 12,
        }}
      >
        🧤 {gk ? 'Esteve na baliza' : 'esteve na baliza?'}
      </button>
      {gk && (
        <>
          <Stepper
            icon="🧤"
            label={`defesas de ${nome}`}
            value={gk.saves || 0}
            onChange={(v) => onGk(id, 'saves', v)}
          />
          <Stepper
            icon="🥅"
            label={`gols sofridos por ${nome}`}
            value={gk.conceded || 0}
            onChange={(v) => onGk(id, 'conceded', v)}
          />
        </>
      )}
    </div>
  )
}
