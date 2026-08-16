# Arquitetura KickHub V2

## Princípios

- identidade global separada da participação numa pelada;
- `pelada_id` como fronteira explícita de autorização;
- UUID interno e slug somente para URL;
- RLS baseada em `auth.uid()` + membership ativa;
- owner, admin e player são papéis locais à pelada;
- regras de futebol permanecem funções de domínio independentes da UI;
- migração Browns por expand/contract, sem apagar IDs ou histórico.

## Fluxo de identidade

Um registro em `auth.users` cria automaticamente um `profile`. O profile pode possuir várias
`pelada_memberships`, inclusive com papéis diferentes. A RPC `create_pelada_with_settings` cria em uma
transação a pelada, a membership owner, os settings escolhidos no wizard e os eventos de auditoria.
O read model `list_my_peladas` deriva a identidade da sessão e devolve apenas memberships e peladas
ativas, sem aceitar um identificador de utilizador fornecido pelo browser.

Jogadores Browns sem Auth permanecem com `auth_user_id` nulo até o claim descrito no ADR 0001. O
vínculo legado é preservado em `legacy_player_id`.

## Contexto da pelada atual

As rotas `/p/:slug` são embrulhadas por `CurrentPeladaProvider`. O provider deriva o slug da rota,
consulta `list_my_peladas` uma única vez e expõe `useCurrentPelada()` com a pelada, a lista de
memberships, o papel local, `canAdmin` e um estado explícito:

```text
loading → a membership ainda está a ser confirmada
error   → o read model falhou; a sessão continua válida
missing → não existe membership ativa para este slug
ready   → pelada e papel resolvidos
```

As páginas do contexto não repetem o lookup nem recebem `slug`/`canAdmin` por props, e a troca
rápida de comunidade usa a mesma lista. `canAdmin` continua a ser apenas uma decisão de
apresentação: quem autoriza é a RLS e as RPCs.

## Autorização

Helpers `SECURITY DEFINER` mínimos convertem `auth.uid()` em profile e respondem se a membership está
ativa ou possui um dos papéis requeridos. Policies usam esses helpers em todas as tabelas tenant.
Inserção direta de peladas é bloqueada; a criação acontece pela RPC transacional. Transições de
membership também são exclusivas das RPCs de onboarding: um jogador pede entrada ou consome um
convite, enquanto owner/admin aprova ou rejeita. Cada transição relevante cria auditoria e, na
revisão, uma notificação para o jogador.

Anon descobre somente peladas com `visibility = public` e `status = active` através da RPC
`discover_public_peladas`. O DTO exclui coordenadas, owner e campos internos. Perfis, memberships,
pedidos, convites e demais dados continuam fechados, sem expor o endereço dos jogos.

## Rotas

```text
/                       landing
/entrar                 autenticação por magic link
/app                    dashboard global
/descobrir              descoberta
/criar                  criação de pelada
/convite/:token         consumo seguro de convite
/u/:username            perfil global
/p/:slug                visão geral da pelada
/p/:slug/jogos          jogos
/p/:slug/jogadores      plantel
/p/:slug/ranking        ranking
/p/:slug/estatisticas   estatísticas
/p/:slug/admin          administração
```

## Estado demonstrativo e estado autoritativo

As fixtures de `src-v2/data/demo.ts` existem para desenvolvimento visual e não são fonte de verdade.
Quando existe uma sessão, o dashboard e o contexto `/p/:slug` usam `list_my_peladas`; não recorrem à
Pelada Browns demonstrativa como fallback. Dados persistentes pertencem ao Supabase. Tema e idioma
podem usar `localStorage` porque são apenas preferências do dispositivo.

## Internacionalização

O núcleo global usa catálogos tipados por domínio para `pt`, `en`, `es`, `fr` e `de`. A preferência
local tem prioridade sobre o locale da conta e do browser. Plurais, datas e números são formatados
por `Intl`, evitando concatenações dependentes de português. Landing, AppShell, dashboard, criação,
autenticação, convite, descoberta, perfil global e o contexto `/p/:slug` (incluindo administração)
já saem dos catálogos. A expansão incremental dos namespaces está documentada em `docs/i18n.md`.

## Jogos e presenças

`games` e `game_attendance` são tenant-native: referenciam `pelada_memberships`,
não a tabela legada `players`, cuja âncora de identidade é o PIN que o ADR 0001 retira. As chaves
compostas `(id, pelada_id)` tornam um vínculo cross-tenant impossível no banco, e não apenas negado
pela RLS.

A escrita passa por RPCs `security definer` porque cada transição tem regras que a RLS não exprime:
a vaga é atribuída sob lock da linha do jogo, quem desiste liberta o lugar para o primeiro da lista
de espera, e a criação escreve auditoria e convocatória na mesma transação.

O import da Pelada Browns remapeia `matches`/`match_stats` para estas entidades através de
`pelada_memberships.legacy_player_id`. As tabelas legadas continuam a ser a origem até à
reconciliação; depois congelam.

## Plantel e força do jogador

`pelada_memberships.overall` guarda a força do jogador **dentro daquela pelada**, não no perfil
global: o mesmo jogador pode ser decisivo num grupo e mediano noutro.

Enquanto não existir histórico de jogos no modelo multi-tenant, o valor é definido por quem
organiza. O `overall` legado era derivado de golos, assistências e avaliações acumuladas — dados que
o novo modelo ainda não tem, e sem os quais o sorteio não teria em que se equilibrar. Quando houver
estatísticas suficientes, o valor passa a ser calculado e o campo manual torna-se um ponto de
partida.

Quem organiza edita o plantel todo; cada jogador edita apenas as suas posições. O `overall` é a
avaliação que o grupo faz de alguém, por isso `update_pelada_member` recusa a alteração do próprio
com `OVERALL_REQUIRES_ADMIN`.

As posições são genéricas — `GK`, `DEF`, `MID`, `ATT` — e não os slots lateralizados do legado, que
assumiam 7x7. O sorteio tem de servir de 5x5 a 11x11.

## Sorteio equilibrado

`src-v2/domain/team-draw.ts` é uma função pura: recebe jogadores e regras, devolve duas equipas. Não
conhece Supabase nem React, por isso testa-se isoladamente. O formato é um parâmetro — o motor legado
assumia 7x7 com dois guarda-redes fixos.

A semente torna o sorteio reproduzível: `games.draw_seed` guarda-a, e `game_lineups.overall_at_draw`
congela a força de cada jogador no instante do sorteio. Sem esse congelamento, reabrir um jogo antigo
mostraria equipas "desequilibradas" que estavam equilibradas no dia.

O cliente calcula e o servidor valida: `save_game_lineup` recusa escalar quem não pertence à pelada
ou não confirmou presença. Confiar na escalação recebida deixaria um administrador escalar alguém de
outra comunidade através da RPC.

## Resultado e estatísticas

O placar é guardado explicitamente em `game_results` e não derivado da soma dos golos: autogolos
contam para o adversário, e uma pelada que só queira registar o resultado sem detalhar quem marcou
continua a poder fechar o jogo.

`game_player_stats` guarda uma linha por jogador — golos, assistências, autogolos e defesas. É sobre
esta tabela que o ranking e o overall calculado vão assentar.

`save_game_result` é idempotente: corrigir um placar mal registado substitui as estatísticas em vez
de as somar outra vez. Só entram jogadores com presença confirmada ou escalação sorteada, portanto a
RPC não aceita creditar golos a quem faltou nem a alguém de outra pelada.

## Ranking e estatísticas

A agregação acontece no banco. Trazer todos os jogos para o browser e somá-los deixaria de funcionar
à segunda época e obrigaria a expor linha a linha o que sai daqui já consolidado.

Participação e resultado são contados de fontes diferentes de propósito:

```text
jogos disputados  ← escalação sorteada OU presença confirmada
vitórias/derrotas ← apenas escalação, porque só ela diz de que lado se jogou
```

Uma pelada que registe o placar sem sortear equipas continua a ver golos e assistências; o que não
aparece é o saldo de vitórias, porque ninguém sabe quem estava em que equipa. A interface diz "sem
jogos decididos" em vez de mostrar 0%, que se leria como ter perdido sempre.

## Overall calculado

`src-v2/domain/player-overall.ts` deriva o overall do que aconteceu em campo, por pelada. É uma
função pura, testada isoladamente.

O problema difícil não é a fórmula, é a confiança. Quem marcou dois golos no primeiro jogo não é um
jogador de 90; quem passou em branco uma vez não é de 20. O valor sofre encolhimento bayesiano
contra cinco jogos-fantasma no neutro, e só ganha peso à medida que a amostra cresce. A interface
marca com asterisco enquanto o número for provisório.

O cálculo **não substitui automaticamente** o valor manual: aparece como sugestão no plantel, e quem
organiza decide aplicá-la. Uma pelada pode discordar do número, e sobrepor-se a ela sem aviso seria
retirar-lhe uma decisão que é sua. Continua a não existir overall global entre peladas.

## Notificações

Uma notificação guarda `kind` e `payload`, nunca a frase escrita. O título é o nome da pelada, que
não se traduz. A frase é montada na apresentação, no idioma de quem lê.

A revisão de pedidos gravava `Pedido aprovado` e `Já podes entrar na pelada.` diretamente na linha:
quem tivesse a conta noutro idioma recebia português, e mudar de idioma depois não reescrevia nada —
a linha ficava congelada na língua de quem aprovou. Corrigido em `20260816040000`.

O cliente conhece um conjunto fechado de tipos e recorre ao texto guardado para os que ainda não
conhece, de modo a que uma notificação nova do servidor apareça com algum conteúdo em vez de uma
linha em branco.

## Administração da pelada

`20260816050000` abre a identidade, as regras de jogo e os papéis à edição. Até aí a pelada ficava
congelada no que o assistente de criação escreveu, e promover alguém a admin só era possível por SQL
— quem organiza não conseguia delegar.

Três decisões que a migration grava:

- **o slug não é editável.** É ele que forma o link partilhado; mudá-lo partia em silêncio todos os
  convites já enviados. `update_pelada_identity` nem sequer recebe o argumento, e um teste verifica a
  ausência do parâmetro, para que a proteção não dependa de alguém se lembrar dela;
- **só o dono muda papéis.** Se um admin pudesse promover admins, bastava um convite mal dado para
  alguém promover aliados e passar a controlar a pelada. `set_pelada_member_role` levanta `OWNER_ONLY`
  a qualquer outro, e remover um admin exige o mesmo — remover é despromover pela porta do lado;
- **o dono não se altera nem se remove.** `peladas.owner_profile_id` aponta para o perfil com
  `on delete restrict`, portanto despromovê-lo deixaria a pelada a apontar para quem já não manda.
  Transferir propriedade muda quem controla os dados de um grupo real e fica fora desta fatia.

Remover é uma mudança de estado, não um `delete`: os jogos, as equipas sorteadas e as estatísticas
apontam para a inscrição, e apagá-la levaria o histórico atrás ou falharia na chave estrangeira. Quem
sai deixa de ocupar vaga nos jogos que aí vêm, e cada lugar libertado passa a quem estava em lista de
espera, pela ordem em que respondeu — o mesmo critério de `set_game_attendance`.

Sair por iniciativa própria não existe: nenhuma das funções deixa alguém remover-se a si mesmo.
Abandonar a pelada é um gesto do jogador, não uma ação de administração, e fica por fazer.

`20260816060000` fecha o buraco que a remoção abriu. `get_pelada_ranking` filtrava por inscrição
activa, portanto quem saía levava consigo os golos, as assistências e as vitórias da tabela por
jogador — verificado com dados reais em staging, onde um jogador com 3 golos desapareceu do ranking
no instante em que foi removido. As linhas continuavam nas tabelas; o que as escondia era o modelo de
leitura. Pior do que a ausência era a incoerência: `get_pelada_totals` soma `game_player_stats` pela
pelada e não pelo membro, logo o total continuava a contar esses golos e o mesmo ecrã mostrava um
total que as suas próprias linhas já não somavam. Quem saiu passa a aparecer marcado como antigo
membro, desde que tenha história — quem foi removido sem nunca ter jogado fica de fora, porque o
ranking é sobre o que aconteceu em campo.

Gravar as definições são duas RPCs em série, uma por tabela. Se a segunda falhar, a identidade fica
gravada e as regras não; a interface diz que falhou e recarrega do servidor, portanto o que o
organizador vê a seguir é o estado real e não o que escreveu.

## Próximas migrations

1. backfill de `pelada_id` nas entidades Browns e memberships por jogador;
2. ~~constraints compostas para impedir FKs cross-tenant~~ — feito em `20260815000000`;
3. claim legado e revogação progressiva de PIN/token;
4. DTOs público/membro/admin e Storage com paths por tenant;
5. preferências de notificação por utilizador e canais além do in-app.

O plano original adiava as entidades de jogo para depois do carimbo do legado, para evitar um fork
entre o histórico Browns e as peladas novas. A ordem foi invertida deliberadamente: sem o ciclo de
jogo não existe produto para testar, e migrar o histórico primeiro colocaria dados em tabelas que
nenhuma interface publicada lê. O risco de fork é evitado pelo remapeamento acima, não pela ordem.
