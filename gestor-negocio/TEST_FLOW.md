# Flujo de prueba completo

## 1. Preparar Supabase
- Ejecuta el SQL de supabase-schema.sql.
- Asegúrate de que las tablas existan y que las políticas estén activas.

## 2. Probar la web cliente
- Abre la web cliente en el navegador.
- Agrega un producto al carrito.
- Envía la solicitud.

## 3. Verificar en Supabase
- Revisa la tabla requests.
- Debe aparecer la solicitud enviada.

## 4. Probar la admin local
- Abre la admin local en http://localhost:8001.
- Revisa si la solicitud aparece en la sección de pedidos.

## 5. Resultado esperado
- Cliente envía pedido.
- Admin lo ve.
- Todo queda persistido en Supabase.
