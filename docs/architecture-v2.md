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
`pelada_memberships`, inclusive com papéis diferentes. A RPC `create_pelada` cria em uma transação a
pelada, a membership owner, os settings e o evento de auditoria.

Jogadores Browns sem Auth permanecem com `auth_user_id` nulo até o claim descrito no ADR 0001. O
vínculo legado é preservado em `legacy_player_id`.

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
Dados persistentes pertencem ao Supabase. Tema e idioma podem usar `localStorage` porque são apenas
preferências do dispositivo.

## Próximas migrations

1. aplicar e validar o onboarding em staging com pgTAP;
2. backfill de `pelada_id` nas entidades Browns e memberships por jogador;
3. constraints compostas para impedir FKs cross-tenant;
4. claim legado e revogação progressiva de PIN/token;
5. DTOs público/membro/admin e Storage com paths por tenant;
6. entidades novas de jogos somente depois do legado estar carimbado e reconciliado.
