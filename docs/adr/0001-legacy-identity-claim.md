# ADR 0001 — Claim de identidade legado Browns

Status: **aceito** — aprovado pelo owner em 16 de agosto de 2026  
Data: 12 de agosto de 2026

## Contexto

Os jogadores Browns atuais não possuem necessariamente email nem identidade em `auth.users`. O PIN
de quatro dígitos e os tokens de dispositivo não são identidade suficiente para uma plataforma
multi-tenant, mas precisam manter o acesso durante a transição.

Não serão inventados emails, compartilhados hashes de PIN com o Supabase Auth nem ligados perfis por
semelhança de nome. O mesmo usuário poderá participar de várias peladas através de um único profile.

## Decisão proposta

1. Criar `profiles` globais com `auth_user_id` nulo para os jogadores Browns legados.
2. Criar uma `pelada_membership` Browns por jogador, preservando `legacy_player_id` como vínculo
   único e auditável.
3. Emitir claim codes aleatórios de 128 bits, de uso único, armazenados somente como SHA-256.
4. Exibir o código apenas em um canal autenticado pelo fluxo legado e nunca em logs, analytics ou
   URLs. O código expira em 30 minutos e admite no máximo cinco tentativas.
5. O usuário cria ou autentica sua conta Supabase Auth e chama uma transação server-side. A
   transação bloqueia a claim, valida hash/expiração/uso, liga `profile.auth_user_id` e registra o
   ator no audit log.
6. Uma conta Auth não pode assumir dois profiles sem um fluxo explícito de merge. Um profile não
   pode ser ligado a duas contas Auth.
7. Após claim bem-sucedido, revogar todos os tokens legados daquele jogador. O PIN continua apenas
   durante uma janela de transição com data de sunset e telemetria agregada.
8. Recuperação manual exige owner autorizado, motivo, audit log e uma nova claim; nunca altera o
   vínculo silenciosamente.

## Invariantes

- `profiles.auth_user_id` é único quando não nulo.
- `(pelada_id, profile_id)` é único para memberships com profile.
- `legacy_player_id` não pode ser reutilizado.
- claim usada, expirada, revogada ou bloqueada não autentica novamente.
- claim de uma pelada não concede papel ou membership em outra.
- nenhuma service role ou claim code chega ao bundle do browser.

## Alternativas rejeitadas

- Email fictício por jogador: cria identidades irrecuperáveis e conflitos futuros.
- Nome + PIN como vínculo definitivo: mantém brute force e ambiguidade entre homônimos.
- Token de dispositivo como identidade global: token é bearer credential legado, não prova de
  identidade durável.
- Merge automático por nome/data de nascimento: alto risco de ligar pessoas diferentes.

## Rollout e rollback

O rollout começa em staging com profiles sem Auth e claims de teste. A ligação é aditiva; as tabelas
legadas continuam sendo a fonte compatível até a validação completa. Antes do sunset, um rollback
pode desfazer apenas o vínculo Auth com registro de auditoria e nova claim. Claims consumidas jamais
são reativadas.

## Aprovação

Aprovado pelo owner em 16 de agosto de 2026, com o desenho detalhado em
[browns-claim-flow.md](../browns-claim-flow.md) à frente.

Confirmado na aprovação:

- **canal de entrega da claim**: a sessão já autenticada da própria Browns, onde o jogador entra com
  o PIN que já tem. O PIN é usado uma última vez para provar identidade, e nunca é transportado;
- **prazo de 30 minutos e limite de cinco tentativas**;
- **recuperação manual**: um owner emite uma claim nova, com motivo escrito e registo de auditoria,
  para quem perdeu o acesso à Browns. Emite — não consome por outra pessoa.

Continua **por decidir**, e não bloqueia a implementação do mecanismo:

- a duração da convivência com o PIN legado, que é uma data de produto;
- quem altera a aplicação Browns para lá colocar o ecrã que gera o código, já que esse repositório é
  o remoto legado e está fora deste trabalho.
