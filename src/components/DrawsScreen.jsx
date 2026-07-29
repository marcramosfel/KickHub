import { formatarDataDoJogo } from '../lib/countdown'
import { vantagem } from '../lib/substitutions'
import DrawView from './DrawView'
import FootballPitch from './FootballPitch'
import AvisoDeDesistencias, { VantagemAtual } from './Substitutions'
import { SectionTitle } from './Ui'
import { colors, fonts, styles } from '../theme'

// Sorteios: o que está publicado para o próximo jogo (com campo) e o último
// sorteio rápido feito pelo admin.

// Uma data inválida não rebenta o `toLocaleDateString` — devolve a string
// "Invalid Date", que o `catch` nunca chega a ver. Daí o teste explícito.
function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DrawsScreen({ proximoJogo, draw, onProfile }) {
  const temEscalacao = Array.isArray(proximoJogo?.lineup) && proximoJogo.lineup.length > 0
  // `formatarDataDoJogo` devolve sempre um objeto (com campos vazios quando
  // não há data): é o `d.hora` que diz se há mesmo data, senão um jogo sem
  // `kickoff_at` mostrava " · " no lugar do "—".
  const d = formatarDataDoJogo(proximoJogo?.kickoff_at)
  const publicadoEm = draw ? formatDate(draw.created_at) : ''
  const quemManda = vantagem(proximoJogo?.team_a_overall, proximoJogo?.team_b_overall)

  return (
    <div>
      <h1 style={{ ...styles.title, fontSize: 22, marginBottom: 4 }}>
        Sorteios <span style={{ color: colors.grass }}>🎲</span>
      </h1>
      <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 14 }}>
        As equipas são montadas pelo overall e pelas posições, na formação 2-3-1.
      </p>

      <SectionTitle>Escalação do próximo jogo</SectionTitle>
      {temEscalacao ? (
        <div className="pb-grid">
          <div className="pb-col-8 pb-col-md-12">
            <div className="pb-card" style={{ padding: 12 }}>
              <FootballPitch
                lineup={proximoJogo.lineup}
                showOverall
                interactive={!!onProfile}
                onPlayerClick={(j) => onProfile?.(j.id)}
              />
            </div>
          </div>
          <div className="pb-col-4 pb-col-md-12">
            <div className="pb-card">
              <div
                style={{
                  fontFamily: fonts.title,
                  letterSpacing: 1,
                  fontSize: 14,
                  marginBottom: 8,
                }}
              >
                Detalhes
              </div>
              <dl style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Par termo="Quando" valor={d.hora ? `${d.data} · ${d.hora}` : '—'} />
                <Par termo="Onde" valor={proximoJogo.location || '—'} />
                <Par termo="⚫ Pretos" valor={proximoJogo.team_a_overall ?? '—'} />
                <Par termo="⚪ Brancos" valor={proximoJogo.team_b_overall ?? '—'} />
                <Par
                  termo="Equilíbrio"
                  valor={
                    proximoJogo.balance_pct != null
                      ? `${Number(proximoJogo.balance_pct).toFixed(1)}%`
                      : '—'
                  }
                />
                <Par
                  termo="Publicado"
                  valor={proximoJogo.published_at ? formatDate(proximoJogo.published_at) : '—'}
                />
              </dl>
              {quemManda.lado && (
                <div style={{ marginTop: 10 }}>
                  {/* sem os números: o equilíbrio e os dois overalls estão
                      na lista mesmo por cima */}
                  <VantagemAtual vantagem={quemManda} comNumeros={false} />
                </div>
              )}
            </div>
          </div>

          {/* a coluna só existe se houver aviso: uma div vazia deixava um
              buraco do tamanho do `gap` da grelha */}
          {proximoJogo.substitutions?.length > 0 && (
            <div className="pb-col-12">
              <AvisoDeDesistencias jogo={proximoJogo} />
            </div>
          )}
        </div>
      ) : (
        <div className="pb-card" style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>
            🎲
          </div>
          <p style={styles.mutedText}>
            Ainda não existe um sorteio publicado para o próximo jogo.
          </p>
        </div>
      )}

      <SectionTitle>Último sorteio rápido</SectionTitle>
      {draw ? (
        <div className="pb-card">
          <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 12 }}>
            {publicadoEm ? `Publicado a ${publicadoEm} — divisão` : 'Divisão'} rápida pela média do
            grupo, sem posições.
          </p>
          <DrawView A={draw.team_a} B={draw.team_b} />
        </div>
      ) : (
        <div className="pb-card" style={{ textAlign: 'center', padding: 22 }}>
          <p style={styles.mutedText}>Ainda não há sorteio rápido publicado.</p>
        </div>
      )}
    </div>
  )
}

function Par({ termo, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <dt style={{ color: colors.muted }}>{termo}</dt>
      <dd className="pb-truncate" style={{ fontWeight: 700, textAlign: 'right' }}>
        {valor}
      </dd>
    </div>
  )
}
