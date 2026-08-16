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

`src-v2/domain/player-overall.ts` calcula o overall, por pelada. É uma função pura, testada
isoladamente. Não existe overall global entre peladas: o mesmo jogador pode ser decisivo num grupo e
mediano noutro.

**Há um só overall, e nasce aqui.** Até esta fatia havia dois números com o mesmo nome a discordar:
o plantel mostrava `pelada_memberships.overall`, escrito à mão por quem organiza, e o ranking
mostrava um valor calculado. Verificado em staging: a mesma jogadora aparecia com 82 no plantel e 53
no ranking, no mesmo dia — e o sorteio equilibrava pelo primeiro, portanto o número que decidia as
equipas não era o número que a pelada via. O valor escrito à mão passou a ser a **nota do grupo**,
uma parcela da conta, e o overall passou a ser calculado em todo o lado a partir dela.

Três regras governam a conta:

1. **Premiar mais do que castigar.**
2. **A ausência de um dado nunca vale zero.** Quem ainda não tem nota do grupo não leva zero de nota:
   a parcela sai da conta e as restantes são renormalizadas. É por isso que `base_rating` viaja como
   `null` desde o RPC até ao domínio, sem passar pelo `Number(x) || 0` do resto do mapeamento.
3. **O número tem de ser explicável.** `explainOverall` devolve as parcelas com os pesos **efetivos**
   — os já renormalizados — e elas somam ao total. Mostrar os pesos nominais daria uma conta que não
   fecha.

Os pesos nominais são quatro: nota do grupo 40%, saldo de vitórias acima do esperado 15%,
desempenho 20% e estrelas dos companheiros 25%, e **os quatro são produzidos**. O do saldo é o único
que desliza — ver [Vitórias acima do esperado](#vitórias-acima-do-esperado). Só o desempenho sofre encolhimento
bayesiano contra cinco jogos-fantasma no neutro, porque só ele é uma amostra pequena — a nota do
grupo e as estrelas são juízos, e valem desde o primeiro dia.

A taxa de vitórias crua **saiu** da conta. Numa pelada com sorteio equilibrado ela luta contra o
próprio motor: se o sorteio funcionar, as taxas convergem para 50% e a parcela mede ruído. O que a
substituirá é o saldo de vitórias acima do esperado — ganhar sendo favorito a 93% não vale o mesmo
que ganhar sendo favorito a 74% — e ainda não está implementado.

A sugestão que o plantel oferece a quem organiza é calculada **sem** a nota do grupo. Se partisse da
própria nota, o número passaria a alimentar-se a si mesmo e deixaria de haver forma de o explicar.

O modelo está completo. Ver [Escala do guarda-redes](#escala-do-guarda-redes) para quem guarda a
baliza, que não usa nenhuma destas parcelas.

## Estrelas pós-jogo

Depois de um jogo ficar registado, quem esteve em campo avalia os **companheiros da sua equipa**, de
1 a 5. O adversário não aparece: ninguém viu jogar quem tinha pelas costas, e deixar avaliar quem se
defronta transforma a nota numa arma. A interface não o oferece e `rate_game_players` recusa-o na
mesma — a interface evita pedir o que vai ser recusado, não é ela que decide.

**As estrelas são privadas por desenho.** A política de leitura de `game_ratings` devolve a cada um
apenas as linhas que ele escreveu; nem sequer o avaliado vê quem lhe deu o quê. O que a pelada vê é
a média, e é `get_pelada_ranking` — `security definer`, portanto acima da RLS — que a agrega. É essa
assimetria que permite publicar a média sem publicar os votos, e é por isso que a verificação de
pertença dentro dessa função não é decorativa.

A tabela não tem política de escrita nenhuma. Tudo passa pela RPC, que valida o que o cliente não
pode garantir: o jogo já foi disputado, quem avalia esteve escalado, quem é avaliado esteve na mesma
equipa, ninguém se avalia a si próprio, e a nota está entre 1 e 5. Uma proposta em que **parte** dos
nomes não é companheiro de equipa é recusada por inteiro: gravar a parte aceitável deixaria o cliente
a pedir o que não devia e a receber metade, em silêncio.

O formulário não copia para estado local o que já foi dado — deriva-o da consulta e guarda apenas o
que foi mexido nesta sessão. Copiar obrigava a um efeito que apagava as escolhas em curso sempre que
a consulta revalidasse.

A média entra no overall como a parcela de 25%. Ver [Overall calculado](#overall-calculado).

## Craque e bagre da rodada

Cada equipa vota no seu. Quem ganhou elege o craque entre os seus; quem perdeu elege o bagre entre os
seus; num empate no placar não há lados e vota-se nos dois. O adversário nunca aparece — deixar votar
em quem se defronta transforma o prémio em ajuste de contas — e `vote_game_awards` recusa-o na mesma.

Os votos são privados, como as estrelas. O **resultado** é da pelada inteira: é o que se celebra.

**Empates são deliberadamente assimétricos.** Craque empatado premeia todos os empatados; bagre
empatado não castiga ninguém. É a mesma regra que governa o resto da conta — premiar mais do que
castigar — e um empate no bagre é justamente o caso em que o grupo não chegou a acordo sobre a culpa.

**Quem levou o prémio** resolve-se por esta ordem: override do admin → vencedor congelado no fecho →
contagem de votos. Uma rodada fechada não se recalcula a cada leitura: um voto atrasado mudaria
retroativamente quem foi craque há três meses, e o overall de duas pessoas com ele.

Isso obrigou a separar dois factos que pareciam um só. **Que o prémio está decidido** vive em
`game_award_decisions`; **quem o levou** vive em `game_awards`. Guardá-los juntos custou um defeito
apanhado contra o Postgres real: quando o admin decidia que ninguém tinha sido bagre, a lista de
vencedores ficava vazia — indistinguível de "ainda não decidido" — e a contagem ao vivo ressuscitava
o bagre que ele acabara de retirar.

`tally_game_awards`, `pelada_award_winners` e `game_team_outcome` são **privadas**. Contam os votos de
toda a gente, e sob a RLS de quem chama devolveriam contagens erradas em silêncio, porque a política
só mostra os votos próprios. Só são alcançáveis de dentro de `get_game_awards` e `get_pelada_ranking`,
que verificam pertença.

Os prémios entram no overall como **ajustes**, não como parcelas: somam-se em pontos depois da média
ponderada, e é por isso que a decomposição os mostra à parte. Contam pela **taxa** — craque em todas
as rodadas vale +9, craque numa de vinte vale +0,45 — para que quem joga há mais tempo não acumule
bónus só por ter jogado mais.

## Vitórias acima do esperado

A pergunta não é "ganhaste?" — é "ganhaste mais do que era suposto?".

A taxa de vitórias crua não serve, e numa pelada com sorteio equilibrado é pior do que inútil: o
motor existe para igualar as equipas, portanto se ele funcionar as taxas convergem para 50% e a
parcela mede ruído. Verificado no próprio staging — o único jogo com escalação tem as duas equipas
em 70,40 de média, ou seja 50/50 por construção.

Mede-se por isso o **saldo**: por cada rodada, o resultado real menos o que a diferença de forças
previa. A expectativa sai de uma logística sobre a diferença de médias de `overall_at_draw`:
`1 / (1 + e^(-(mediaMinha − mediaDelas) / 5))`.

O **5** é a única constante inventada nesta parcela. Foi calibrada para os exemplos do modelo caírem
onde ele diz, e confirmada contra o Postgres: 93% de favoritismo exige cerca de 13 pontos de
diferença de média e ganhar assim vale **+0,07**; 74% exige cerca de 5 pontos e ganhar assim vale
**+0,26**. Usa-se a média e não a soma, para que equipas com número diferente de jogadores não
pareçam mais fortes só por serem mais.

Só entram rodadas com escalação **e** resultado. Quem apenas confirmou presença conta como jogo
disputado mas não tem lado, e sem lado não há expectativa a comparar — o saldo fica a `null`, não a
zero, porque zero diria que rendeu exactamente o esperado.

A nota é `clamp(50 + (saldo / rodadas) × 100, 0, 100)`, com 50 a significar "exactamente o esperado".

**O peso desliza** de 0% a 15% à medida que há rodadas medidas, chegando ao máximo às cinco. A
alternativa — ligar a parcela de uma vez às cinco — fazia um jogador que rendeu exactamente o
esperado perder cinco pontos de um dia para o outro, só por cruzar a fronteira. Um número que cai sem
nada ter acontecido em campo é impossível de explicar a quem o vê.

É também o que segura o caso extremo: num jogo 50/50 quem ganha fica com nota 100 e quem perde com 0,
mas a uma rodada o peso é 0,03 e não 0,15.

## Títulos

Seis títulos, cada um a valer **+1** somado no fim: artilheiro, rei das assistências, mais vitórias,
mais craques, mais jogos, e sequência de três ou mais vitórias seguidas.

Três regras governam quem os leva:

- **empate premeia todos** os empatados;
- um título **só existe se o líder tiver mais do que zero** — não há artilheiro numa pelada sem golos;
- a sequência **não é um lugar único**: é uma marca, e quem chegar a três leva, vários ao mesmo tempo.

O bónus é fixo e pequeno de propósito. Os golos já contam no desempenho; o título é uma medalha, não
uma segunda dose da mesma coisa. Proporcional aos golos seria contar os golos duas vezes.

**Nenhum título mede o overall.** Se medisse — "maior overall do plantel" — o número passaria a
alimentar-se a si mesmo, e o resultado dependeria da ordem por que fossem calculados.

### A consequência arquitetural

Os títulos dependem de comparar o plantel inteiro, portanto **não existe forma correcta de calcular o
overall de um jogador isoladamente**. São duas passagens: primeiro as estatísticas de todos, depois
os títulos, depois o overall.

Isso está expresso na API do domínio e não apenas na documentação. `explainSquadOverall(rows)` recebe
o plantel e devolve um `Map` de decomposições — é a função que o plantel, o ranking e o sorteio usam.
`explainOverall` continua a existir para quem já sabe que títulos aquele jogador tem, e é o que os
testes usam para isolar as parcelas.

A sequência de vitórias é o único dos seis que nenhuma soma guarda: precisa da **ordem** dos jogos, e
por isso vem do servidor em `current_win_streak`. Conta-se do jogo mais recente para trás e pára na
primeira não-vitória — a marca é de estar em sequência agora, não de ter estado em Março. Um empate
corta tal como uma derrota, porque o que se celebra são vitórias seguidas e não invencibilidade.

Enquanto o ranking não chega, o plantel mostra reticências em vez de "por avaliar": não saber ainda e
não ter nota são estados diferentes, e confundi-los diria a quem tem nota que não tem.

## Escala do guarda-redes

Um guarda-redes não cabe na fórmula de campo: não marca, não assiste, e a opinião do grupo sozinha
castiga quem passa a rodada a apanhar bolas. Tem escala própria:

```
defesas          × 60%   — a percentagem de remates defendidos
golos sofridos   × 20%   — comparados com a média da pelada
jogos sem sofrer × 10%
vitórias na baliza × 10%
```

**As defesas pesam mais** porque são a parte quase inteiramente dele. Golos sofridos, jogos sem
sofrer e vitórias dependem também da linha à frente, e por isso valem menos.

**Os golos sofridos comparam-se com a média da pelada**, e não com um número absoluto:
`clamp(50 + 15 × (médiaDaPelada − sofridosPorJogo), 0, 100)`. É o que torna o valor justo para quem
joga atrás de uma defesa que sofre muito. Verificado contra o Postgres: numa pelada com média de 3,5
golos sofridos por jogo, quem sofreu 3 fica em 57,5 e quem sofreu 4 fica em 42,5. Consequência a ter
em conta: sofrer zero não dá 100 — dá `50 + 15 × média`. Só chega ao topo quem estiver 3,3 golos por
jogo abaixo da média do grupo.

A média é mais uma quantidade que exige o plantel inteiro, e por isso é calculada na mesma passagem
dos títulos, em `leagueConcededPerGame`.

**A confiança** cresce até às cinco rodadas na baliza e puxa o número ao neutro abaixo disso, para
que uma rodada de sorte — ou de azar — não mande ninguém para o topo nem para o fundo. É aplicada
parcela a parcela, o que é aritmeticamente igual a aplicá-la ao total, com a vantagem de a
decomposição continuar a somar ao número mostrado. **Um guarda-redes precisa da explicação dele**:
mostrar-lhe o painel da fórmula de campo seria pior do que não ter painel.

### Quando a escala se aplica

Quando **metade ou mais** das rodadas do jogador foram na baliza. A escala segue onde ele jogou e não
o rótulo que tem: um híbrido que guardou a baliza uma jornada em dez não é julgado por essa uma, e um
jogador rotulado como guarda-redes que nunca lá esteve não tem nada que a escala meça.

Uma consequência que só aparece com dados reais: numa pelada com `goalkeeper_mode = 'rotating'`
ninguém é marcado como guarda-redes na escalação, portanto **ninguém é julgado por esta escala** —
o que está certo, porque se a baliza roda durante o jogo ninguém a guardou naquela rodada. A escala
vale para peladas que jogam com guarda-redes fixos ou mistos.

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
