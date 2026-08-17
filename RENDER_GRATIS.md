# ELEMENTA — Render gratuito

Esta variante é para aprovação visual online.

## O que foi removido do Blueprint
- PostgreSQL pago
- plano Starter pago
- preDeploy de banco

## O que continua
- visual v4
- catálogo das quatro velas
- carrinho
- checkout em modo demonstração
- CEP
- frete fallback
- painel admin (dados JSON efêmeros)
- responsividade

## Deploy
Substitua os arquivos do repositório GitHub por esta versão ou, no mínimo,
substitua `render.yaml`.

No Render:
1. Blueprint
2. selecione o repositório
3. branch `main`
4. path `render.yaml`
5. Apply/Deploy

Variáveis:
- BASE_URL: deixe vazio no primeiro deploy e depois coloque a URL pública
- ADMIN_TOKEN: crie uma senha
- WHATSAPP_NUMBER: opcional

IMPORTANTE:
O filesystem do serviço gratuito é efêmero. Esta variante serve para visualizar,
navegar e aprovar o site. Não deve ser usada como loja comercial definitiva.
