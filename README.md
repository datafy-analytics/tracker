# Datafy Tracker

Rastreamento server-side para TikTok Ads.

## 1. Instalacao do Script

Insira em todas as paginas do seu funil, logo apos `<head>`.

```html
<script
  src="https://cdn.jsdelivr.net/gh/datafy-analytics/tracker@latest/t.js"
  data-token="SEU_TOKEN"
></script>
```

## 2. Envio de Conversoes via API

```
POST https://api.datafy-analytics.com/api/t/{TOKEN}/event
```

```json
{
  "orderId": "ORDER_123",
  "amount": 9990,
  "status": "paid",
  "utm_source": "TT-1778200000-abc123",
  "leadName": "Joao Silva",
  "leadEmail": "joao@email.com"
}
```

### Status

| Status | Evento TikTok |
|--------|---------------|
| `paid` | Purchase |
| `initiate_checkout` | InitiateCheckout |
| `waiting_payment` | ViewContent |
| `failed` | - |
| `refunded` | - |

## 3. Eventos Manuais

```javascript
datafy('purchase', { amount: 9990, orderId: 'ORDER-123' })
datafy('ic')
```

```html
<button data-datafy-checkout>Finalizar Compra</button>
```

## 4. Exemplos

### cURL

```bash
curl -X POST https://api.datafy-analytics.com/api/t/SEU_TOKEN/event \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORDER_123","amount":9990,"status":"paid","utm_source":"TT-1778200000-abc123"}'
```

### PHP

```php
$ch = curl_init('https://api.datafy-analytics.com/api/t/SEU_TOKEN/event');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'orderId' => 'ORDER_123',
    'amount' => 9990,
    'status' => 'paid',
    'utm_source' => $_GET['utm_source'] ?? ''
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_exec($ch);
```
