# Anime Tracker

Um lugar para reunir os animes que já assisti, os que estou acompanhando e aqueles que ainda quero conhecer.

O **Anime Tracker** é um projeto web que estou desenvolvendo para organizar minha biblioteca de animes e compartilhar essa coleção com outras pessoas. A ideia é ter uma experiência visual, com navegação por capas e categorias, mas sem deixar de lado o que mais importa: saber o que já vi e onde parei.

O projeto ainda está em desenvolvimento. Estou ajustando a interface e acrescentando funcionalidades conforme vou utilizando o site.

## O que tem no projeto

- **Biblioteca pessoal:** separação entre *Assistindo*, *Concluídos* e *Assistir mais tarde*.
- **Progresso por episódios:** registro dos episódios assistidos para continuar de onde parei.
- **Perfis:** cadastro, foto, capa personalizada e opção de compartilhar a biblioteca publicamente.
- **Catálogo de animes:** pesquisa, destaques, tendências e categorias por gênero.
- **Detalhes dos títulos:** sinopse, trailer do YouTube e links de onde assistir, quando essas informações estão disponíveis.
- **Interface interativa:** carrosséis, menu lateral retrátil e transições durante a navegação.

Os dados do catálogo são consultados pela API do AniList. Por isso, informações como rankings, trailers e links de plataformas dependem do que está disponível na fonte. A disponibilidade dos serviços de streaming também pode variar de país para país.

## Tecnologias

- **React + TypeScript** — interface e funcionalidades.
- **Vite** — ambiente de desenvolvimento e build.
- **Motion** — animações e transições.
- **Supabase** — autenticação, banco de dados e armazenamento das imagens de perfil.
- **AniList API** — informações e descoberta de animes.

## Executando localmente

É necessário ter o Node.js instalado e configurar um projeto no Supabase para usar as funções de conta e biblioteca sincronizada.

```bash
git clone https://github.com/lucaspfvr/anime-tracker.git
cd anime-tracker
npm install
```

Crie um arquivo `.env.local` na raiz do projeto (você pode partir do `.env.example`) e adicione as credenciais públicas do Supabase:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

Os scripts SQL necessários para as tabelas e as políticas de acesso estão na pasta `supabase/`. Eles devem ser aplicados no projeto Supabase correspondente.

Para iniciar o ambiente de desenvolvimento:

```bash
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
```

## Compartilhamento e privacidade

Cada usuário organiza a própria biblioteca. O perfil pode ser mantido privado ou disponibilizado por um link público, conforme a escolha do titular.

O Anime Tracker **não hospeda nem transmite episódios**. Os trailers são exibidos a partir do YouTube, e os links de plataformas servem como referência para encontrar os títulos.

## Próximos passos

Quero continuar melhorando a navegação, o acompanhamento dos episódios e a experiência de quem visita um perfil compartilhado. O objetivo é que a biblioteca seja útil no dia a dia e também uma forma de mostrar os animes que fizeram parte da minha história.

---

Desenvolvido por [lucaspfvr](https://github.com/lucaspfvr).
