# Como cada jogador da Browns recupera o seu histórico no KickHub

Estado: **desenho para aprovação**. Nada disto está implementado.
Data: 16 de agosto de 2026

Este documento detalha o que o [ADR 0001](adr/0001-legacy-identity-claim.md) decide em princípio:
ecrã a ecrã, incluindo o que acontece quando corre mal. Serve para se decidir com o desenho à frente
e não com a intenção.

## O problema, em números reais

A base da Browns tem 30 jogadores. **Todos** têm `pin_hash` e **nenhum** tem conta no Supabase Auth —
o projeto legado tem zero utilizadores de autenticação. A identidade de um jogador Browns é hoje o
seu `user_id` (texto) mais um PIN de quatro dígitos, verificado pela aplicação.

Cada um desses 30 tem história agarrada a si: escalações, golos, defesas, avaliações recebidas e
votos dados. Essa história é o que faz a migração valer a pena, e é o que se perde se a ligação entre
"a pessoa" e "o registo" for feita mal.

## O que não se faz, e porquê

**Os PINs não viajam.** Estão guardados como *hash*, que é irreversível — não há como recuperá-los.
E mesmo que houvesse: quatro dígitos são dez mil tentativas. Num grupo de WhatsApp fechado isso
chega; atrás de um endereço público que qualquer pessoa alcança, não chega. O modelo `user_id + PIN`
foi desenhado para um contexto que deixa de existir no instante em que o link circula.

**Não se inventam emails.** Fabricar `nome@browns.local` para cada jogador cria identidades que
ninguém controla e que nunca mais se conseguem recuperar nem fundir.

**Não se liga por semelhança de nome.** Dois "Pedro" e um homónimo bastam para dar a história de uma
pessoa a outra. Um erro destes não se descobre depressa e não se desfaz bem.

## O desenho: quem prova que é ele usa o que já tem

A ideia é simples. A pessoa **já sabe** provar que é ela — tem o PIN da Browns. O que não queremos é
transportar esse PIN. Então usa-se o PIN uma última vez, no sítio onde ele ainda faz sentido, para
gerar um código que só serve para uma coisa: ligar aquele registo a uma conta Google.

### Passo 1 — na Browns, como sempre

O jogador entra na Browns com o `user_id` e o PIN dele, como faz hoje. Aparece-lhe uma faixa nova:

> **A Browns mudou-se para o KickHub.**
> O teu histórico — jogos, golos, avaliações — vai contigo.
> [Obter o meu código de transferência]

Ao carregar, o servidor gera um código aleatório de 128 bits, guarda **apenas** o SHA-256 dele, e
mostra-o uma vez:

> O teu código: `K7QM-2X9F-BHTD-4RSW`
> Válido durante 30 minutos. Não o partilhes — quem o tiver fica com o teu histórico.
> [Continuar para o KickHub]

O código só aparece a quem já provou ser quem diz, dentro da sessão autenticada da Browns. Nunca vai
para um link, para um email, para os *logs* ou para as analíticas.

### Passo 2 — no KickHub, entrar com a conta

O botão leva ao KickHub. A pessoa entra com Google (ou email). É uma conta dela, que ela já controla
e já sabe recuperar — o KickHub nunca guarda uma senha.

### Passo 3 — reclamar

Logo após entrar, um ecrã pede o código:

> **Tens histórico na Pelada Browns?**
> Cola aqui o código que a Browns te deu.
> [__________________]  [Reclamar]

O servidor, numa só transação: bloqueia a linha da *claim*, confere o hash, a validade e se já foi
usada, liga `profiles.auth_user_id` à conta que acabou de entrar, marca a *claim* como consumida e
regista quem fez o quê no *audit log*.

Feito isto, a pessoa vê o seu plantel, o seu overall e todos os jogos que jogou. Nada foi recriado —
o registo era dela desde o início e passou apenas a ter dono.

## Quando corre mal

| O que acontece | O que a pessoa vê | O que o sistema faz |
|---|---|---|
| Código errado | "Esse código não confere. Tens mais 4 tentativas." | Conta a tentativa. Não diz se o código existe. |
| Cinco tentativas falhadas | "Bloqueámos este código por segurança. Pede um novo na Browns." | Invalida a *claim*. Obriga a gerar outra. |
| Passaram os 30 minutos | "Este código expirou. Pede um novo na Browns." | Recusa. A *claim* expirada nunca reactiva. |
| Já reclamou antes | "Já tens o teu histórico ligado a esta conta." | Não faz nada. Não é erro. |
| Outra conta tenta o mesmo código | "Este código já foi usado." | Recusa. Uso único, sem excepção. |
| Já tem outro histórico ligado | "Esta conta já está ligada a outro jogador." | Recusa. Fundir dois requer um fluxo explícito que não existe. |
| Perdeu o acesso à Browns | — | Só um *owner* resolve: ver abaixo. |

### Quem perdeu o PIN

É o caso que vai acontecer, e não pode depender de adivinhar. Um *owner* da pelada gera uma *claim*
manualmente pelo painel de administração, com um motivo escrito, e entrega-a pessoalmente. Fica
registado quem a emitiu, para quem e porquê. Nunca se altera a ligação em silêncio, e nunca se
"transfere" um histórico já reclamado sem passar pelo mesmo caminho auditado.

## Quem nunca reclamar

Alguns dos 30 não vão reclamar — mudaram de grupo, deixaram de jogar, não ligam a isto.

A história deles **fica**. O `pelada_memberships` existe com o `legacy_player_id` preenchido e o
`profiles.auth_user_id` a nulo, e a coluna já é anulável no schema atual. Aparecem no ranking e nas
estatísticas pelo nome, como qualquer outro. O que não têm é sessão. Se um dia reclamarem, a
história estava lá à espera.

Isto é a mesma escolha que já foi feita para quem sai da pelada: o ranking é sobre o que aconteceu em
campo, não sobre quem tem conta.

## O que acontece ao PIN

Depois de uma *claim* bem sucedida, os *device tokens* daquele jogador na Browns são revogados —
eram credenciais que já não representam ninguém.

O PIN em si continua a funcionar na Browns durante uma janela de transição, com data marcada, para
que quem ainda não migrou não fique de fora. Passada essa data, a Browns deixa de autenticar e o
KickHub é o único caminho. **A data é uma decisão de produto, não minha.**

## O que falta decidir

1. **A janela de transição.** Quanto tempo a Browns continua a aceitar PIN.
2. **Onde vive o ecrã do passo 1.** A faixa e o botão vivem na aplicação Browns, cujo repositório é o
   remoto legado — que eu não posso tocar. Ou o código é gerado por outra via, ou alguém com acesso
   faz essa alteração.
3. **Se o *owner* pode reclamar por outra pessoa.** O desenho acima diz que emite a *claim* mas não a
   consome. Convém confirmar que é isso que se quer.

## O que isto não resolve

Este desenho liga pessoas a históricos. **Não** move os dados — isso é o backfill, que tem os seus
próprios gates em [foundation-gates.md](foundation-gates.md) e depende de os destinos existirem no
KickHub. Hoje ainda faltam a votação de craque e bagre (60 votos na Browns) e a opinião do grupo
voto a voto (841 avaliações), que colapsariam numa média se migrassem já.
