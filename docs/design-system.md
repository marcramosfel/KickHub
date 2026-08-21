# Design system

Fundação de design do KickHub: tokens, componentes e as regras que os mantêm
coerentes. Cobre §31–36 do master prompt.

A promessa é uma só: **mudar a identidade visual não pode obrigar a reescrever
componentes**. Tudo o que se segue existe para tornar isso verdade.

## Tokens

Os tokens são variáveis CSS em [`src-v2/styles.css`](../src-v2/styles.css), no
bloco `:root`. O tema escuro redefine apenas as cores e as sombras — espaçamento,
raio e movimento são os mesmos nos dois, porque duas escalas seriam dois sistemas.

[`src-v2/lib/brand.ts`](../src-v2/lib/brand.ts) espelha-os em TypeScript para o
código que precisa de lhes chamar pelo nome, sem escrever `var(--…)` à mão.

| Grupo | Tokens |
|---|---|
| Cor — marca | `--brand`, `--brand-ink`, `--dark`, `--dark-2` |
| Cor — superfície | `--bg`, `--surface`, `--surface-2`, `--border` |
| Cor — texto | `--ink`, `--muted` |
| Cor — estado | `--danger`, `--orange` (aviso), `--blue` (informação), `--brand` (sucesso) |
| Tipografia | `--font-sans` (Manrope), `--font-display` (Space Grotesk) |
| Espaçamento | `--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 18px · `--space-5` 26px · `--space-6` 40px |
| Raio | `--radius-sm` 10px · `--radius-md` 14px · `--radius-lg` 18px · `--radius-pill` 999px |
| Sombra | `--shadow`, `--shadow-raised` |
| Movimento | `--motion-fast` .12s · `--motion-base` .18s · `--motion-slow` .32s |
| Camadas | `tokens.z` em `brand.ts`: base 0 · sticky 20 · nav 30 · dialog 60 · toast 80 |
| Pontos de quebra | 760px (móvel) · 1024px (tablet) · 1280px (desktop) |

O verde da marca (`#d8ff45`) é o sucesso do sistema. Não há um `--color-success`
separado de propósito: uma pelada que corre bem é verde, e ter duas cores para a
mesma ideia é ter uma para esquecer de actualizar.

### Regra de uso

- Nunca escrever um hexadecimal num componente. Se falta uma cor, falta um token.
- Nunca escrever um pixel de espaçamento fora da escala. Se falta um degrau,
  discute-se o degrau, não se inventa o valor.
- Media queries vivem no CSS. `breakpoints` em `brand.ts` só serve ao que se
  decide em JavaScript.

## Componentes

Os primitivos vivem em [`src-v2/components/ui.tsx`](../src-v2/components/ui.tsx).
Os compostos são componentes próprios, e todos consomem apenas tokens.

| Componente | Onde | Variantes |
|---|---|---|
| `Button` | `ui.tsx` | `primary`, `secondary`, `outline`, `ghost` × `sm`, `md`, `lg`, `icon` |
| `Card` | `ui.tsx` | superfície base; a classe adicional dá o layout |
| `Badge` | `ui.tsx` | `neutral`, `lime`, `blue`, `orange` |
| `Avatar` | `ui.tsx` | `sm`, `md`, `lg`; iniciais quando não há foto |
| `EmptyState` | `ui.tsx` | ícone, título, corpo e acção opcional |
| `PlayerCardArt` | `PlayerCards.tsx` | `sm`, `md` × cinco raridades |
| `CardBadge` | `PlayerCards.tsx` | emblema da conquista principal |
| `ShareButton` | `ShareButton.tsx` | `outline`, `ghost`, `primary` |
| `DiscoveryMap` | `DiscoveryMap.tsx` | vista de mapa dos resultados |
| `AppShell` | `AppShell.tsx` | lateral (desktop) + barra inferior (móvel) |
| `NotificationBell` | `NotificationBell.tsx` | contador e lista |
| `ThemeToggle` | `ThemeToggle.tsx` | claro/escuro |

### Estados que todos os módulos têm de ter

Um módulo que lê dados mostra sempre os quatro, e nunca inventa dados para
esconder um deles:

1. **A carregar** — `aria-busy` e um texto próprio.
2. **Erro** — `role="alert"`, o que falhou e um botão para tentar de novo.
3. **Vazio** — `EmptyState`, a dizer o que fazer para deixar de estar vazio.
4. **Com dados**.

## Marca

[`brand.ts`](../src-v2/lib/brand.ts) é o único sítio onde o nome da plataforma
está escrito. "Pelada Browns" nunca aparece em componentes genéricos: é uma
comunidade dentro do produto, não o produto (§34).

O nome da plataforma pode mudar. Quando mudar, muda em `brand.ts` e no catálogo
i18n — em mais lado nenhum.

## Acessibilidade

O que o sistema garante, e é verificado em teste onde faz sentido:

- **Teclado** — tudo o que é accionável é `<button>` ou `<a>`. Nada de `div`
  clicável, e por isso o `Tab` chega a todo o lado sem `tabindex` inventado.
- **Salto para o conteúdo** — `AppShell` tem o `skip-link` como primeiro nó.
- **Foco visível** — `:focus-visible` com contorno de 3px e afastamento de 3px,
  e nunca `outline: none` sem substituto.
- **Alvos de toque** — os botões têm `min-height: 44px`; os `sm` têm 38px e são
  reservados a acções secundárias.
- **A cor nunca é o único sinal** — as raridades dos cards, as equipas do
  simulador e os estados de entrada têm sempre ícone ou texto além da cor.
- **Regiões nomeadas** — cada `<nav>` tem `aria-label` próprio, e o conteúdo
  principal é `<main id="main-content">`.
- **Movimento** — `prefers-reduced-motion: reduce` desliga animações e
  transições em toda a folha de estilos.
- **Estados anunciados** — avisos são `role="status"`, erros são `role="alert"`,
  e a contagem de resultados da descoberta é `aria-live="polite"`.

## O que falta

- **Storybook ou catálogo visual.** Esta tabela é a documentação; um catálogo
  navegável é trabalho por fazer.
- **Branding book.** §34 descreve-o como futuro, e o produto está preparado para
  o receber sem mexer em componentes.
- **Auditoria de contraste automatizada.** O contraste foi escolhido à mão;
  falta uma verificação que corra em CI.
