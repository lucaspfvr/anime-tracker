# Disponibilizar para amigos — Vercel + Supabase existente

Esta entrega prepara o código. Ainda não foi publicada nem alterou o banco remoto.

## 1. Aplicar a revisão

O pacote contém a versão completa recuperada do GitHub e das etapas 5–9. Se você fez alterações locais depois da etapa 9, compare antes de substituir.

1. Na pasta do projeto, registre suas alterações atuais com Git ou faça uma cópia de segurança.
2. Extraia o ZIP e copie o conteúdo de `anime-tracker/` para a pasta atual do projeto, substituindo os arquivos correspondentes. Preserve `.git`, `.env.local` e qualquer arquivo pessoal. O ZIP não contém credenciais.
3. Os cinco arquivos antigos listados em `REMOVIDOS.txt` não são usados e podem ser apagados. Copiar um ZIP por cima não os remove automaticamente.
4. No PowerShell da pasta do projeto:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

No navegador, confira menu, catálogo, login, perfil e biblioteca. Use outro terminal para o Git enquanto o Vite estiver rodando:

```powershell
git add .
git status
git commit -m "Revisa código e prepara perfis públicos e publicação"
git push origin main
```

## 2. Publicar sem comprar domínio

1. Acesse https://vercel.com/new e entre com o GitHub correto: `lucaspfvr`.
2. Importe `lucaspfvr/anime-tracker`.
3. Framework: **Vite**. Build: `npm run build`. Output: `dist`. Node: **24.x**.
4. Em Environment Variables, copie do seu `.env.local` os valores existentes:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Use a chave pública/publishable (ou anon legada). Nunca use `service_role` ou secret key no frontend.
6. Clique Deploy. A plataforma fornecerá um endereço `https://NOME-DISPONIVEL.vercel.app`. Não precisa adquirir ou configurar domínio próprio.
7. Compartilhe a URL de **Production**. Se aparecer uma exigência de login na Vercel ao abrir em janela anônima, confira Deployment Protection e permita acesso público à versão de produção.

`vercel.json` já inclui a regra SPA para que abrir ou atualizar `/@usuario` carregue o site em vez de retornar 404. Alterar variáveis exige novo deploy, porque o Vite as inclui no build.

## 3. Usar o mesmo banco e habilitar cadastro

No painel do **mesmo projeto Supabase**:

1. Authentication → URL Configuration: coloque a URL publicada em **Site URL** e adicione essa URL em **Redirect URLs**. Mantenha `http://localhost:5173` autorizado para desenvolvimento.
2. Confira que novos cadastros por e-mail estão habilitados.
3. Se a confirmação de e-mail estiver ativa, configure **Custom SMTP** para enviar confirmações aos seus amigos. O SMTP padrão do Supabase só envia para endereços autorizados da equipe; seus amigos não precisam ser membros da equipe.
4. Para um teste fechado sem configurar envio de e-mail, existe a opção de desativar **Confirm email**. Isso permite cadastrar e-mails sem comprovar sua posse; escolha conscientemente no painel. Não fizemos essa alteração. Sem SMTP, recuperação de senha por e-mail também não estará disponível.

Se contas, banners e listas já funcionam no seu computador, esta revisão não exige nova migração. Os SQL recuperados estão no repositório para documentação e reprodução:

- `supabase/schema.sql` — esquema original da etapa 5.
- `supabase/etapa-6-banner.sql` — complemento de banners.

Para um projeto NOVO, execute nessa ordem. Não recrie o projeto atual nem substitua dados existentes. As políticas necessárias permitem leitura anônima apenas de perfis públicos e escrita apenas do proprietário. Confira no painel se não existem políticas adicionais mais permissivas.

## 4. Compartilhar seu perfil

1. Entre na sua conta e abra **Minha lista → Editar perfil**.
2. Escolha seu `@usuário`, por exemplo `lucaspfvr`.
3. Ative **Perfil público** e salve.
4. Clique **Compartilhar**.

O endereço será `https://SEU-SITE.vercel.app/@lucaspfvr` (exemplo; use a URL real do deploy). O visitante consegue ver Assistindo, Concluídos e Assistir mais tarde, com progresso. Não precisa entrar para consultar um perfil público. Para criar e editar a própria lista, precisa cadastrar uma conta.

Links antigos `?perfil=lucaspfvr` continuam válidos. Alterar seu username muda o link; o endereço antigo não é reservado. Desativar Perfil público bloqueia novas consultas públicas. Imagens de avatar/banner continuam sendo arquivos com URL pública, conforme o comportamento existente.

## 5. Teste antes de enviar o link

- Abra seu link em janela anônima: suas listas públicas aparecem sem login.
- Crie uma segunda conta: ela possui biblioteca própria e não pode editar a sua.
- Torne seu perfil privado, atualize a janela anônima: os dados não devem aparecer.
- Abra diretamente `/@seuusuario` e pressione F5: não deve retornar 404.
- Confirme o e-mail de uma conta de teste, se esse recurso estiver habilitado.

Os testes automatizados usam um banco isolado e não contatam seu Supabase. Cadastro real, entrega de e-mail, imagens e políticas atualmente instaladas precisam dessa conferência no deploy.

Fontes oficiais consultadas:
- https://vercel.com/docs/frameworks/frontend/vite
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
