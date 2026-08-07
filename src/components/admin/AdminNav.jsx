import { colors, fonts } from '../../theme'

// Navegação do painel de administração.
//
// Eram nove abas numa barra que rolava de lado: para chegar aos "IDs" havia
// que arrastar, e no computador sobrava meio ecrã em branco ao lado. Agora:
//
//   ≥1024px  barra lateral fixa, agrupada por assunto, sempre à vista
//   <1024px  as mesmas entradas em fila, a rolar — mas agrupadas na mesma,
//            com o grupo a servir de separador
//
// O corte é o mesmo do resto da app (`--pb-*` do layout.css) e a regra vem
// da orientação de navegação adaptativa: ecrã grande prefere barra lateral.

export const GRUPOS = [
  {
    id: 'geral',
    titulo: 'Geral',
    itens: [{ id: 'visao', rotulo: 'Visão geral', icone: '📋' }],
  },
  {
    id: 'jogo',
    titulo: 'O jogo',
    itens: [
      { id: 'jogos-ciclo', rotulo: 'Jogos', icone: '⚽', badge: 'resultadosPendentes' },
      { id: 'novo', rotulo: 'Novo sorteio', icone: '🎲' },
      { id: 'desistencias', rotulo: 'Trocas', icone: '🔁' },
    ],
  },
  {
    id: 'grupo',
    titulo: 'O grupo',
    itens: [
      { id: 'pedidos', rotulo: 'Pedidos', icone: '🙋', badge: 'pedidos' },
      { id: 'plantel', rotulo: 'Plantel', icone: '👥' },
      { id: 'posicoes', rotulo: 'Posições', icone: '🧭', badge: 'semPosicao' },
      { id: 'utilizadores', rotulo: 'Acessos e IDs', icone: '🔑' },
    ],
  },
  {
    id: 'registos',
    titulo: 'Registos',
    itens: [
      { id: 'jogos', rotulo: 'Rodadas antigas', icone: '📜' },
      { id: 'faltas', rotulo: 'Avaliação do grupo', icone: '⭐', badge: 'faltas' },
    ],
  },
]

// Todos os destinos, sem os grupos — para quem só precisa da lista.
export const DESTINOS = GRUPOS.flatMap((g) => g.itens)

function Badge({ n }) {
  if (!n) return null
  return (
    <span
      aria-label={`${n} por tratar`}
      style={{
        marginLeft: 'auto',
        background: colors.error,
        color: '#fff',
        borderRadius: 999,
        padding: '1px 7px',
        fontSize: 11,
        fontFamily: fonts.body,
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  )
}

// Uma entrada. `min-height: 44` é a área de toque mínima — no telemóvel isto
// é a diferença entre acertar e abrir a aba errada.
function Item({ item, ativo, badges, onEscolher, lateral }) {
  const n = item.badge ? badges?.[item.badge] || 0 : 0
  return (
    <button
      type="button"
      onClick={() => onEscolher(item.id)}
      aria-current={ativo ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: lateral ? '100%' : 'auto',
        minHeight: 44,
        padding: lateral ? '10px 12px' : '10px 14px',
        borderRadius: 10,
        border: 'none',
        // No desktop a barra à esquerda marca o ativo; no telemóvel é o fundo.
        borderLeft: lateral ? `3px solid ${ativo ? colors.grass : 'transparent'}` : 'none',
        background: ativo ? 'rgba(52, 208, 88, 0.14)' : 'transparent',
        color: ativo ? colors.text : colors.muted,
        fontFamily: fonts.body,
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background-color 160ms ease, color 160ms ease',
      }}
    >
      <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>
        {item.icone}
      </span>
      <span className={lateral ? 'pb-truncate' : undefined} style={{ minWidth: 0 }}>
        {item.rotulo}
      </span>
      <Badge n={n} />
    </button>
  )
}

export default function AdminNav({ tab, badges, onEscolher, lateral = false }) {
  if (lateral) {
    return (
      <nav aria-label="Secções da administração" className="pb-card" style={{ padding: 10 }}>
        {GRUPOS.map((g) => (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                fontFamily: fonts.title,
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: colors.muted,
                padding: '6px 12px 4px',
              }}
            >
              {g.titulo}
            </div>
            {g.itens.map((it) => (
              <Item
                key={it.id}
                item={it}
                ativo={tab === it.id}
                badges={badges}
                onEscolher={onEscolher}
                lateral
              />
            ))}
          </div>
        ))}
      </nav>
    )
  }

  // Telemóvel: uma fila que rola, com o nome do grupo a separar. Rola dentro
  // do próprio bloco (`pb-scroll-x`), nunca a página.
  return (
    <nav
      aria-label="Secções da administração"
      className="pb-scroll-x"
      style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 4, marginBottom: 12 }}
    >
      {GRUPOS.map((g) => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span
            aria-hidden
            style={{
              fontFamily: fonts.title,
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.line,
              padding: '0 4px',
            }}
          >
            {g.titulo}
          </span>
          {g.itens.map((it) => (
            <Item
              key={it.id}
              item={it}
              ativo={tab === it.id}
              badges={badges}
              onEscolher={onEscolher}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}
