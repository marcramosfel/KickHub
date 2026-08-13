# ⚽ Pelada

Plataforma para organizar, gerenciar e conectar peladas de futebol de forma simples, divertida e justa.

O projeto nasceu inicialmente como uma aplicação criada entre amigos para organizar a **Pelada Browns**, permitindo gerar times equilibrados, registrar resultados, acompanhar estatísticas e criar rankings dos jogadores.

Com a evolução do projeto, a proposta passou a ser maior: transformar a aplicação em uma plataforma onde diferentes grupos possam criar suas próprias peladas, administrar jogadores, organizar jogos e até descobrir outras peladas próximas.

---

## 🚀 Visão do Produto

A ideia é transformar o Pelada em uma espécie de **rede social para futebol amador**.

Cada usuário poderá participar de uma ou várias peladas, enquanto administradores poderão criar e gerenciar suas próprias comunidades.

Exemplo:

```text
Marcos
├── Pelada Browns
│   └── Jogador
│
├── Pelada Bellinzona
│   └── Administrador
│
└── Pelada Lugano
    └── Jogador
```

Cada pelada funciona como uma comunidade independente dentro da mesma plataforma.

---

# ✨ Principais funcionalidades

## ⚽ Gestão de Peladas

Administradores poderão criar e configurar suas próprias peladas.

Configurações previstas:

- Nome da pelada
- Descrição
- Foto ou identidade visual
- País
- Região
- Cidade
- Local habitual
- Dia e horário dos jogos
- Formato do jogo
- Número máximo de jogadores
- Regras de entrada
- Visibilidade
- Configurações de goleiros
- Configurações de sorteio
- Estatísticas disponíveis
- Sistema de avaliações

---

## 👥 Gestão de Jogadores

Cada pelada possui sua própria lista de participantes.

Os jogadores poderão:

- Criar um perfil
- Entrar em uma pelada através de convite
- Solicitar participação em peladas públicas
- Participar de múltiplas peladas
- Acompanhar suas estatísticas
- Consultar seus jogos
- Consultar conquistas
- Participar de avaliações pós-jogo

Os administradores poderão:

- Aprovar jogadores
- Recusar solicitações
- Remover participantes
- Definir administradores
- Definir posições
- Gerenciar permissões
- Configurar jogadores disponíveis para cada partida

---

# 🎲 Sorteio Inteligente de Times

Um dos principais diferenciais do projeto é o sistema de geração de equipes equilibradas.

O sorteio pode considerar diferentes critérios como:

- Overall dos jogadores
- Posições
- Goleiros
- Desempenho histórico
- Avaliações
- Equilíbrio geral das equipes

Exemplo:

```text
14 jogadores disponíveis

        ↓

Algoritmo de Balanceamento

        ↓

TIME BRANCO      TIME PRETO
Overall: 81.4    Overall: 81.1
```

O objetivo não é simplesmente gerar equipes aleatórias, mas proporcionar o **jogo mais equilibrado possível**.

---

# 🧤 Sistema de Goleiros

Cada jogo pode possuir configurações diferentes para goleiros.

O administrador poderá definir:

### Goleiros fixos

Cada equipe possui um jogador dedicado exclusivamente ao gol.

### Goleiros rotativos

Os jogadores começam no gol e posteriormente fazem rotação durante a partida.

Nesse cenário, um jogador que iniciou como goleiro continua podendo receber:

- gols
- assistências
- avaliações
- estatísticas

caso posteriormente participe da partida como jogador de linha.

---

# 📊 Estatísticas

A plataforma permite registrar e acompanhar estatísticas dos jogadores.

Exemplos:

- Jogos
- Vitórias
- Empates
- Derrotas
- Gols
- Assistências
- Participações em gols
- Média de gols
- Média de assistências
- Sequências de vitórias
- Invencibilidade
- Avaliações
- Overall

As estatísticas são mantidas dentro do contexto de cada pelada.

Exemplo:

```text
Marcos

Pelada Browns
Overall: 84
23 jogos
41 gols
19 assistências

Pelada Bellinzona
Overall: 78
6 jogos
5 gols
4 assistências
```

O desempenho de um jogador em uma pelada não precisa necessariamente determinar seu desempenho em outra.

---

# ⭐ Overall

O sistema de Overall representa uma avaliação geral do jogador dentro da pelada.

A fórmula pode considerar diferentes fatores, como:

```text
50% Avaliação dos jogadores
25% Desempenho
25% Avaliação pós-jogo
```

O algoritmo poderá continuar evoluindo conforme novos dados estiverem disponíveis.

---

# 🏆 Rankings

Cada pelada poderá possuir diferentes rankings.

Exemplos:

- Melhor Overall
- Artilheiros
- Assistências
- Participações em gols
- Vitórias
- Melhor média
- Melhor sequência
- Invencibilidade
- Melhor jogador do mês

---

# 👑 Conquistas e Cards

Os jogadores podem desbloquear conquistas com base no desempenho.

Exemplos:

- 👑 Rei dos Craques
- ⚽ Rei das Peladas
- 🎯 Rei das Assistências
- 🏆 Rei das Vitórias
- 🐟 Rei dos Bagres
- 🧤 Paredão

Essas conquistas podem gerar cards personalizados para o perfil do jogador e para compartilhamento.

---

# 🌟 Seleção da Pelada

A aplicação poderá destacar os principais jogadores de determinado período através da **Seleção da Pelada**.

A seleção poderá utilizar dados como:

- Overall
- Gols
- Assistências
- Avaliações
- Resultados
- Desempenho recente

O objetivo é gerar uma experiência visual semelhante a cards de futebol.

Os jogadores poderão compartilhar a seleção diretamente em grupos ou redes sociais.

---

# 🤔 Curiosidades

A área de Curiosidades utiliza as informações disponíveis da pelada para gerar conteúdos divertidos.

Exemplos:

### Melhor jogo possível

```text
Melhor Time Branco
VS
Melhor Time Preto
```

O algoritmo tenta criar o confronto mais competitivo possível.

### Jogo dos Perebas 😂

O sistema também poderá gerar uma partida usando jogadores de menor desempenho.

### Simulação de Campeonato

Caso existam jogadores suficientes, o sistema poderá criar várias equipes equilibradas e simular um pequeno campeonato.

Exemplo:

```text
30 jogadores

↓  

4 equipes equilibradas

↓  

Simulação do campeonato

↓  

Probabilidade de cada time vencer
```

---

# 🧪 Simulador de Times

Os usuários poderão montar manualmente duas equipes e comparar seus desempenhos.

Exemplo:

```text
TIME A
Marcos
João
Pedro
Daniel
...

VS

TIME B
Wallace
Miguel
Emerson
Fafá
...
```

O simulador poderá apresentar:

- Overall médio
- Força ofensiva
- Força defensiva
- Equilíbrio
- Probabilidade estimada de vitória

---

# 🌎 Descobrir Peladas

Um dos principais objetivos futuros da plataforma é permitir que os usuários encontrem peladas próximas.

Exemplo:

```text
📍 Bellinzona

Peladas próximas

⚽ Calcetto Bellinzona
2.3 km
Terças · 20:00

⚽ Pelada Ticino
6.8 km
Sextas · 19:00

⚽ Lugano Football
17 km
Domingos · 18:00
```

Os usuários poderão filtrar por:

- distância
- região
- cidade
- dia da semana
- horário
- formato
- nível
- quantidade de jogadores

A busca por proximidade poderá utilizar **PostGIS através do Supabase/PostgreSQL**.

---

# 🗺️ Peladas por Região

A plataforma poderá mostrar a distribuição das comunidades registradas.

Exemplo:

```text
Ticino

Bellinzona      18 peladas
Lugano          43 peladas
Locarno         15 peladas
Mendrisio       11 peladas
```

Isso permite transformar a aplicação em um verdadeiro diretório de futebol amador.

---

# 🔗 Convites

Cada administrador poderá compartilhar um link exclusivo para sua pelada.

Exemplo:

```text
pelada.app/join/A7F8K2
```

Ao abrir o link, o jogador poderá visualizar as informações básicas e solicitar entrada.

Exemplo:

```text
⚽ Pelada Browns

📍 Vilamoura
📅 Sextas
🕐 19:00
⚽ 7x7
👥 28 jogadores

[ Participar da Pelada ]
```

Dependendo da configuração, a entrada poderá ser:

- automática
- mediante aprovação
- somente através de convite

---

# 🔐 Permissões

As permissões são definidas dentro do contexto de cada pelada.

Principais roles:

```text
owner
admin
player
```

Um usuário pode ser administrador de uma pelada e jogador em outra.

Exemplo:

```text
Marcos

Pelada Browns
→ player

Pelada Bellinzona
→ owner

Pelada Lugano
→ player
```

As permissões não devem depender somente do frontend.

A proteção dos dados deve ser realizada no banco utilizando **Supabase Row Level Security — RLS**.

---

# 🏗️ Arquitetura

A aplicação está sendo preparada para uma arquitetura **multi-tenant**.

Cada pelada representa um tenant dentro da plataforma.

```text
                    ┌──────────────┐
                    │    Users     │
                    └──────┬───────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Pelada Members  │
                  └────────┬────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      ┌─────────────┐             ┌─────────────┐
      │   Pelada A  │             │   Pelada B  │
      └──────┬──────┘             └──────┬──────┘
             │                           │
       ┌─────┼─────┐               ┌─────┼─────┐
       ▼     ▼     ▼               ▼     ▼     ▼
     Games Stats Players         Games Stats Players
```

---

# 🗄️ Banco de Dados

A aplicação utiliza **Supabase/PostgreSQL**.

A estratégia é utilizar uma única infraestrutura para múltiplas peladas, em vez de criar um projeto Supabase separado para cada comunidade.

Principais entidades previstas:

```text
profiles
peladas
pelada_members
pelada_invites
join_requests

games
game_players
teams

player_stats
ratings
achievements

notifications
feed_events

pelada_settings
```

Praticamente todas as informações específicas de uma comunidade devem possuir:

```text
pelada_id
```

Exemplo:

```text
games

id
pelada_id
date
status
created_at
```

Isso permite que milhares de peladas utilizem a mesma aplicação mantendo seus dados isolados.

---

# 🔒 Segurança

A plataforma deverá utilizar:

- Supabase Auth
- Row Level Security
- Policies por pelada
- Controle de permissões
- Validação server-side
- Proteção de ações administrativas
- Validação de uploads
- Rate limiting quando necessário

Exemplo conceitual:

```text
Jogador da Pelada A

        ↓

pode acessar

        ↓

dados da Pelada A

        ✕

não pode acessar dados privados da Pelada B
```

---

# 🧱 Estrutura de Código

A organização ideal do projeto deve ser baseada em funcionalidades/domínios.

Exemplo:

```text
src/

features/
├── peladas/
├── discovery/
├── members/
├── games/
├── teams/
├── stats/
├── ratings/
├── achievements/
└── admin/

components/
├── ui/
└── layout/

hooks/
├── useCurrentPelada
├── useMembership
└── usePermissions

services/
└── supabase/

domain/
├── draw/
├── stats/
└── ratings/
```

A lógica de negócio deve ser separada dos componentes visuais sempre que possível.

---

# 🗃️ Database Migrations

Mudanças estruturais no banco devem ser versionadas.

```text
supabase/

migrations/
├── create_peladas.sql
├── create_pelada_members.sql
├── add_pelada_id_to_games.sql
├── create_rls_policies.sql
└── ...
```

Evite depender exclusivamente de alterações manuais através do dashboard do Supabase.

---

# 🧪 Testes

As funcionalidades críticas devem possuir testes.

Principais cenários:

```text
✓ jogador da Pelada A não acessa dados privados da B

✓ jogador comum não consegue criar jogos

✓ administrador consegue criar jogos

✓ administrador consegue aprovar membros

✓ jogador removido perde o acesso

✓ jogador pode participar de várias peladas

✓ estatísticas são calculadas corretamente

✓ sorteio gera equipes válidas

✓ avaliações não podem ser duplicadas
```

---

# 📱 Experiência do Usuário

A aplicação deve funcionar prioritariamente em dispositivos móveis.

Principais áreas:

```text
Home

Minhas Peladas

Descobrir

Jogos

Ranking

Jogadores

Estatísticas

Perfil
```

Dentro de uma pelada:

```text
Pelada Browns

├── Home
├── Jogos
├── Jogadores
├── Ranking
├── Seleção
├── Curiosidades
├── Estatísticas
└── Administração
```

---

# 🔄 Fluxo de uma Pelada

```text
Administrador cria pelada

        ↓

Configura regras

        ↓

Compartilha link

        ↓

Jogadores se registram

        ↓

Administrador aprova

        ↓

Jogo é criado

        ↓

Jogadores confirmam presença

        ↓

Algoritmo sorteia equipes

        ↓

Jogo acontece

        ↓

Administrador registra resultado

        ↓

Gols / Assistências / Estatísticas

        ↓

Jogadores avaliam

        ↓

Overall atualizado

        ↓

Ranking / Cards / Conquistas
```

---

# 🛣️ Roadmap

## Fase 1 — Multi-Pelada

- [ ] Criar entidade `peladas`
- [ ] Criar `pelada_members`
- [ ] Relacionar jogos com `pelada_id`
- [ ] Relacionar estatísticas com peladas
- [ ] Criar roles por pelada
- [ ] Implementar RLS
- [ ] Migrar Pelada Browns como primeira pelada da plataforma

---

## Fase 2 — Gestão

- [ ] Criar wizard de criação de pelada
- [ ] Criar configurações
- [ ] Criar convites
- [ ] Criar solicitações de entrada
- [ ] Aprovação de jogadores
- [ ] Gestão de administradores

---

## Fase 3 — Experiência do Jogador

- [ ] Criar dashboard "Minhas Peladas"
- [ ] Criar perfil global
- [ ] Histórico de partidas
- [ ] Estatísticas por pelada
- [ ] Conquistas
- [ ] Cards
- [ ] Notificações

---

## Fase 4 — Discovery

- [ ] Localização das peladas
- [ ] Busca por região
- [ ] Busca por cidade
- [ ] Busca por proximidade
- [ ] Filtros
- [ ] PostGIS
- [ ] Peladas públicas

---

## Fase 5 — Social

- [ ] Feed
- [ ] Compartilhamento
- [ ] Seleção da Pelada
- [ ] Curiosidades
- [ ] Simulador
- [ ] Campeonatos
- [ ] Rankings regionais

---

# 🎯 Objetivo

O objetivo é evoluir de:

> "Um aplicativo para sortear os times da nossa pelada de sexta."

para:

> **"A plataforma onde grupos de futebol organizam, acompanham e conectam suas peladas."**

A aplicação deve manter o espírito divertido que originou o projeto, enquanto evolui para uma arquitetura capaz de suportar múltiplas comunidades, jogadores e regiões.

---

# 🏁 Origem

O projeto começou com a **Pelada Browns**, criada inicialmente entre amigos.

A necessidade era simples:

> Como criar dois times equilibrados para nossa pelada?

A partir disso começaram a surgir:

- sorteio inteligente
- jogadores
- posições
- overalls
- estatísticas
- gols
- assistências
- rankings
- avaliações
- cards
- conquistas
- seleção da pelada
- simuladores

O que começou como uma brincadeira evoluiu para a ideia de criar uma plataforma completa para futebol amador.

**Pelada Browns será a Pelada #1. ⚽**