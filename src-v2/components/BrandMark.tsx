/**
 * A marca do KickHub.
 *
 * O símbolo é um **K inscrito no círculo central de um campo**. A escolha é
 * deliberada em três frentes:
 *
 * - Não é uma bola. Uma bola é o que qualquer app de futebol usa, e por isso
 *   não distingue nada. O círculo central com a linha de meio-campo é igualmente
 *   legível como futebol e não aparece em mais lado nenhum.
 * - O círculo é também o *hub*: um centro com coisas à volta. As duas leituras
 *   — campo e comunidade — vivem na mesma forma, que é o que faz um símbolo
 *   valer mais do que um desenho bonito.
 * - O K sobrevive a 16 píxeis. Foi desenhado ao contrário do costume: primeiro
 *   no tamanho do favicon, e só depois ampliado. Traços de 2.6 sobre 32 nunca
 *   caem abaixo de um píxel inteiro num ecrã comum.
 *
 * Uma só geometria serve tudo — favicon, barra, ícone de aplicação — e é por
 * isso que vive num componente e não em cinco ficheiros que hão-de divergir.
 */
export type BrandMarkTone = 'brand' | 'ink' | 'inverse' | 'currentColor'

const STROKE: Record<BrandMarkTone, string> = {
  // O lima sobre escuro é a combinação da marca; as outras existem para os
  // sítios onde ela não manda — um favicon monocromático, um documento impresso.
  brand: 'var(--brand, #d8ff45)',
  ink: 'var(--dark, #0a1710)',
  inverse: '#ffffff',
  currentColor: 'currentColor',
}

export function BrandMark({
  size = 32, tone = 'brand', plate = false, title,
}: {
  size?: number
  tone?: BrandMarkTone
  /** Com fundo próprio, para ícones de aplicação e avatares. */
  plate?: boolean
  /** Dado só quando o símbolo aparece sozinho; ao lado do nome é decorativo. */
  title?: string
}) {
  const stroke = STROKE[tone]
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {plate && <rect width="32" height="32" rx="9" fill="var(--dark, #0a1710)"/>}
      {/* O círculo central. Aberto em baixo à direita: fechado, o K ficava
          preso numa moeda; aberto, o símbolo respira e ganha direcção. */}
      <circle
        cx="16" cy="16" r="11"
        fill="none" stroke={stroke} strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="52 17" strokeDashoffset="-9"
      />
      {/* O K: haste e as duas diagonais a encontrarem-se no centro do círculo,
          que é o mesmo ponto de onde o pontapé parte. */}
      <path
        d="M11.6 8.6v14.8M21.4 8.6 13.6 16l7.8 7.4"
        fill="none" stroke={stroke} strokeWidth="2.8"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}
