// Os ícones das estatísticas, num sítio só.
//
// Estavam escritos à mão em cada ecrã, e o resultado inevitável já tinha
// acontecido: o 🥅 significava ao mesmo tempo "autogolo" e "gol sofrido". No
// formato de rodízio essas duas coisas aparecem NA MESMA LINHA do formulário
// de resultado — um jogador que marcou na própria baliza e que também esteve
// no gol ficava com dois 🥅 seguidos a querer dizer coisas diferentes.
//
// Daí a regra: nenhum ícone se repete nesta tabela, e nenhum ecrã escreve um
// emoji de estatística à mão.

export const ICONE = {
  jogos: '👟',
  gols: '⚽',
  // A letra, e não o 🅰️.
  //
  // O emoji é um BADGE — um quadrado vermelho cheio — e ao lado do ⚽, da 👑
  // e do 👟 parecia um botão enfiado no meio dos outros; era também largo ao
  // ponto de o número se lhe colar. O 🎁 resolvia o desenho mas trocava o
  // significado por uma piada, e "A" é o que toda a gente já lê como
  // assistência. Como é texto latino, mede-se com precisão e nunca depende
  // de que fonte de emoji o telemóvel escolhe.
  assistencias: 'A',
  // O autogolo é o único que não tem convenção óbvia. Não pode ser 🥅 (é o
  // gol sofrido) nem ⚽ (não é um gol do jogador, e é esse o ponto de o
  // separar). O 🙈 diz o que é preciso: aconteceu, e ninguém quer falar nisso.
  autogolos: '🙈',
  golsSofridos: '🥅',
  defesas: '🧤',
  semSofrer: '🛡️',
  craque: '👑',
  bagre: '🐟',
  vitorias: '🏆',
  empates: '🤝',
  derrotas: '💀',
  estrelas: '⭐',
  overall: '📊',
}

// Rótulo curto + ícone, para as grelhas de números onde o espaço é pouco.
// `${ICONE.gols} GOLS` é a forma que os cards e os perfis usam.
export const comIcone = (chave, rotulo) => `${ICONE[chave] || ''} ${rotulo}`.trim()
