# Datafy Tracker

Rastreamento server-side para TikTok Ads.

## Instalacao

```html
<script
  src="https://cdn.jsdelivr.net/gh/datafy-analytics/tracker@latest/t.js"
  data-token="SEU_TOKEN"
  data-api="https://seu-backend.com"
  async>
</script>
```

## Eventos manuais

```js
// Initiate Checkout
datafy('ic')

// Purchase
datafy('purchase', { amount: 9990, orderId: 'ORDER-123' })
```

## Checkout automatico

```html
<button data-datafy-checkout>Comprar</button>
```
