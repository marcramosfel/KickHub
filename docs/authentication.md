# Autenticação

O KickHub usa Supabase Auth como identidade global. O mesmo fluxo Google cria a conta na primeira
entrada e restaura a sessão nas entradas seguintes. O frontend recebe somente a URL do projeto e a
publishable key; nenhum client secret, secret key ou `service_role` pode chegar ao browser.

## Fluxo

1. `/entrar` chama `signInWithOAuth({ provider: 'google' })`.
2. O cliente usa Authorization Code + PKCE e regressa a `/app`.
3. O Supabase cria ou recupera `auth.users`.
4. O trigger `handle_new_auth_user` cria o `profiles` global na primeira entrada.
5. A sessão é persistida e renovada pelo Supabase JS.
6. O menu da conta permite terminar a sessão em desktop e mobile.

O magic link por email continua disponível como alternativa. A demonstração continua acessível sem
sessão enquanto as páginas deixam gradualmente de usar fixtures.

## Google Cloud

Crie um OAuth Client do tipo **Web application**. Use um cliente separado por política da equipa ou
um único cliente com os dois callbacks abaixo:

```text
https://ehbkjwtrrzekkdllchzb.supabase.co/auth/v1/callback
https://qowwsaaodrsxxaakfybd.supabase.co/auth/v1/callback
```

Para desenvolvimento local com a stack Supabase CLI, adicione também:

```text
http://127.0.0.1:54321/auth/v1/callback
```

O OAuth client secret deve ser inserido diretamente no painel do Supabase. Nunca o coloque na
Vercel, no GitHub, em `.env` do frontend ou no repositório.

## Supabase hospedado

Em **Authentication → Providers → Google**, habilite o provider e informe o Client ID e o Client
Secret nos projetos Staging e Production.

Em **Authentication → URL Configuration**, autorize os destinos reais da aplicação:

```text
http://localhost:5173/app
https://kick-hub-git-test-marcosramos543-5403s-projects.vercel.app/app
https://kick-hub-git-main-marcosramos543-5403s-projects.vercel.app/app
```

Quando existir um domínio oficial, use-o como Site URL de Production e mantenha apenas redirects
necessários. Não autorize wildcards amplos para domínios que a equipa não controla.

## Verificação

- abrir `/entrar` no Preview da branch `test`;
- clicar em **Continuar com Google**;
- concluir o consentimento;
- confirmar o regresso a `/app`;
- confirmar o nome/avatar Google no shell;
- confirmar uma linha em `auth.users` e a linha correspondente em `public.profiles`;
- sair e entrar novamente, verificando que o mesmo profile foi reutilizado.
