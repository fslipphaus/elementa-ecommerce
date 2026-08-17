# ELEMENTA E-commerce v3

Versão de produção do e-commerce da ELEMENTA.

## O que mudou
- PostgreSQL com fallback local em JSON
- Migração e seed automáticos
- Estoque transacional: baixa apenas após pagamento aprovado
- Cotação real de frete pelo Melhor Envio quando o token estiver configurado
- Fallback de frete por UF quando a API logística não estiver configurada
- Múltiplas opções de entrega no checkout
- E-mails automáticos via Resend:
  - pedido recebido para o cliente
  - novo pedido para o administrador
  - pagamento aprovado para o cliente
- Mercado Pago Checkout Pro e webhook
- Painel administrativo para pedidos, estoque e preço
- Deploy Render com PostgreSQL declarado em `render.yaml`

## Primeira execução local
1. `cp .env.example .env`
2. Configure as variáveis desejadas.
3. `npm install`
4. Se houver PostgreSQL: `npm run migrate && npm run seed`
5. `npm start`
6. Loja: `http://localhost:3000`
7. Admin: `http://localhost:3000/admin.html`

Sem `DATABASE_URL`, a loja continua usando JSON local.
Sem `MELHOR_ENVIO_TOKEN`, usa a tabela fallback de frete.
Sem `RESEND_API_KEY`, não envia e-mails.
Sem `MERCADO_PAGO_ACCESS_TOKEN`, o checkout funciona em modo demonstração.

## PostgreSQL
Configure `DATABASE_URL`. O schema está em `db/schema.sql`.

## Melhor Envio
Variáveis:
- `MELHOR_ENVIO_TOKEN`
- `MELHOR_ENVIO_ENV=production` ou `sandbox`
- `MELHOR_ENVIO_ORIGIN_CEP`
- `MELHOR_ENVIO_USER_AGENT`

A cotação usa produtos com dimensões em cm, peso em kg e valor segurado unitário.

## Resend
Configure:
- `RESEND_API_KEY`
- `EMAIL_FROM` (o domínio precisa estar verificado)
- `EMAIL_ADMIN`

## Render
O `render.yaml` cria:
- Web Service
- Render Postgres
- comando de pre-deploy para migração e seed

Configure no Render as variáveis secretas listadas no blueprint.

## Domínio
Depois do deploy, adicione seu domínio personalizado no provedor de hospedagem e configure:
`BASE_URL=https://seu-dominio.com.br`

Depois, use esse mesmo domínio nas URLs de retorno/webhook dos serviços externos.

## Antes de vender
- Troque `ADMIN_TOKEN`
- Use credenciais de produção
- Verifique o domínio no Resend
- Teste Mercado Pago em ambiente de teste
- Teste Melhor Envio em sandbox
- Confirme pesos/dimensões reais do pacote
- Revise política de frete grátis, trocas, privacidade, termos e LGPD
