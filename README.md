# Plano de Ação · WBC e FitFeed

Plataforma do plano de ação semanal e mensal do time comercial (pré-vendas e vendas conectadas).
Cada pessoa entra com o próprio acesso e vê só o próprio plano. O gestor vê o time todo.

```
Clint (webhooks + CSV) ──► /api/webhook/clint ──► Postgres (Neon) ◄── Plataforma (/)
```

**Para o time:** Meu plano · Plano mensal · Fechamento de sexta · Meu dash
**Para o gestor:** Planos do time (RTC e daily) · Planos mensais · Visão geral · Acessos · Dados do Clint

---

## Subir na Vercel (uma vez só, ~20 minutos)

### 1. Criar o projeto
1. Na Vercel, entre na mesma conta do painel comercial e clique em **Add New → Project**.
2. Importe o repositório **`plano-de-acao`**. Não mude nada e clique em **Deploy**.
   O primeiro deploy pode reclamar do banco. É esperado: ele vem no passo 2.

### 2. Criar o banco
1. No projeto, abra **Storage → Create Database → Neon** (o gratuito atende).
2. Crie um banco **novo**, separado do painel comercial, e conecte ao projeto.
   A variável `DATABASE_URL` aparece sozinha.

### 3. Definir as senhas
Em **Settings → Environment Variables**:

| Variável | O que colocar |
|---|---|
| `WEBHOOK_SECRET` | Uma senha longa e aleatória (ex.: 40 letras e números). Vai na URL dos webhooks e assina as sessões. |
| `DASHBOARD_USER` | Seu usuário de gestor no primeiro acesso (ex.: `vinicius`). |
| `DASHBOARD_PASSWORD` | Sua senha no primeiro acesso. |
| `DASHBOARD_NOME` | Seu nome como aparece na plataforma (ex.: `Vinicius Paiva`). |

Depois: **Deployments → ⋯ no último deploy → Redeploy**.

### 4. Criar as tabelas
Abra uma vez no navegador:
```
https://SEU-PROJETO.vercel.app/api/setup?token=SEU_WEBHOOK_SECRET
```
A resposta deve ter `"ok": true`. Isso também cria os acessos de Gabriel, Ana e Izadora (ainda sem senha).

### 5. Primeiro acesso
1. Abra `https://SEU-PROJETO.vercel.app`, entre com `DASHBOARD_USER` e `DASHBOARD_PASSWORD` e crie a sua senha.
2. Em **Dados do Clint**, importe os dois CSVs exportados do Clint (WBC e FitFeed). O funil é detectado pela origem.
3. Em **Acessos**, clique em **Gerar senha** para cada pessoa e envie a mensagem pronta. No primeiro acesso, cada um cria a própria senha.

---

## Webhooks no Clint

São **2 origens** (Pipeline de Vendas = WBC · Inserção (Inbound) = FitFeed) com **4 webhooks cada**, todos **POST**.
Na origem: **⋯ → Configurações → Integrações → + Nova integração → Webhook → Enviar webhook**.

| Gatilho no Clint | URL |
|---|---|
| O negócio for criado | `https://SEU-PROJETO.vercel.app/api/webhook/clint?token=SEU_WEBHOOK_SECRET&funil=wbc&gatilho=criado` |
| Qualquer mudança de etapa | `...&funil=wbc&gatilho=etapa` |
| Status mudou para Ganho | `...&funil=wbc&gatilho=ganho` |
| Status mudou para Perdido | `...&funil=wbc&gatilho=perdido` |

Na origem do FitFeed, troque `funil=wbc` por `funil=fitfeed`.

### Campos para mapear
| Nome no envio | Campo do Clint | |
|---|---|---|
| `deal_id` | ID do negócio | **obrigatório** |
| `etapa` | Etapa do negócio | **obrigatório** |
| `status` | Status do negócio | **obrigatório** |
| `dono_email` | E-mail do dono do negócio | **obrigatório** (liga o negócio à pessoa) |
| `dono` | Nome do dono do negócio | recomendado |
| `empresa` | Nome da empresa (organização) | recomendado |
| `contato_nome` | Nome do contato | recomendado |
| `valor` | Valor do negócio | recomendado |
| `origem` | Origem | recomendado |
| `data_reuniao` | Data da reunião agendada | opcional (quando o time passar a usar) |

Se o Clint não deixar renomear, o receptor também reconhece os nomes mais comuns (ex.: `user_email`, `stage`, `organization_name`).

### Conferir
Crie um negócio de teste e mova de etapa. Em **Dados do Clint**, "Último evento do Clint" deve mostrar o horário.
Se não aparecer, no Neon (**Storage → Neon → Open in Neon → SQL Editor**):
```sql
select recebido_em, funil, gatilho, erro, payload from clint_eventos order by id desc limit 10;
```

---

## Datas de previsão
O Clint não tem data de fechamento. Por isso a **previsão de fechamento** (vendas) e a **data da reunião** (pré-vendas)
são preenchidas no próprio plano. Se o time passar a usar o campo de reunião agendada no Clint, mapeie `data_reuniao`
no webhook e a data passa a vir sugerida.

## Regras
- **Busca de empresas:** mostra os negócios ativos em que a pessoa é dona no Clint. Etapas ignoradas na busca:
  Perdido, Ganho, Fechado, Stand-by, Repescagem e NF (ajuste em `lib/config.js`).
- **Produtos:** Membership, Mídia, Patrocínio e as combinações (lista em `lib/config.js` e `public/app.js`).
- **Permissões:** conferidas no servidor (`lib/acoes.js`). O membro só altera os próprios itens; o gestor só lê os planos e
  administra acessos e dados.

## Estrutura
| Caminho | O quê |
|---|---|
| `public/app.js` | A tela (todas as visões) |
| `app/globals.css` | Visual no padrão da Plataforma WBC |
| `app/api/dados` · `app/api/acao` | Leitura e gravação, com permissões |
| `app/api/webhook/clint` | Receptor dos webhooks |
| `app/api/setup` | Cria/atualiza as tabelas |
| `lib/` | Banco, login, regras e importação |
