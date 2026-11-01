# Anime Tracker

Aplicação em React e TypeScript para descobrir animes, acompanhar episódios e compartilhar listas pessoais. Catálogo AniList; autenticação, perfis e biblioteca no Supabase.

## Funcionalidades

- Destaques, pesquisa, trailers, links de streaming e tradução de sinopses.
- Listas Assistindo, Concluídos e Assistir mais tarde com progresso por episódios.
- Cadastro por e-mail/senha, foto e banner de perfil.
- Perfis públicos opcionais em `/@usuario`; visitantes podem consultar as três listas.
- Biblioteca da primeira versão preservada no navegador, com avaliações de 0,5 a 5 estrelas. Essas avaliações ainda não são sincronizadas com o Supabase.
- Menu retrátil e animações que respeitam a preferência de movimento reduzido.

## Rodar no Windows

Na pasta do projeto, com Node 22.18+ (incluindo Node 24):

```powershell
npm.cmd ci
npm.cmd run dev
```

Mantenha seu `.env.local`. Para instalação nova, copie `.env.example` para `.env.local` e preencha URL e chave pública do seu projeto Supabase. Sem esses valores, o catálogo funciona, mas o cadastro fica indisponível.

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

## Organização

- `src/components/`: interface do catálogo, conta, perfil e trailers.
- `src/hooks/`: sincronização da conta e tradução com cache/cancelamento.
- `src/lib/`: cliente Supabase, URLs de perfil e funções compartilhadas.
- `src/App.tsx` e `src/model.ts`: biblioteca local antiga, carregada sob demanda.
- `supabase/`: SQL original recuperado das etapas 5 e 6; tabelas, gatilhos, RLS e buckets.
- `tests/`: links de perfis e políticas de acesso executadas em Postgres local (PGlite).

## Publicação

Siga [PUBLICAR.md](PUBLICAR.md) para hospedar na Vercel usando um endereço `*.vercel.app`, com o mesmo banco existente. Não é necessário comprar domínio.

## Limites atuais

A biblioteca antiga usa IDs MyAnimeList; a atual usa IDs AniList. Não misturamos esses registros nem migramos automaticamente seus dados locais. APIs de catálogo/tradução podem limitar requisições. Os testes locais de RLS não substituem verificar as políticas e o cadastro no projeto Supabase real.
