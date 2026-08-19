# Prueba local antes de subir

## 1) Prueba la admin localmente

Sirve esta carpeta con:

```bash
python -m http.server 8001
```

Y abre:

```text
http://localhost:8001/
```

## 2) Prueba la web cliente

También puede usar el mismo proyecto Supabase, pero si quieres probar por separado, puedes abrir la web cliente desde su propio archivo o servidor local.

## 3) Importante

- La admin local y la web cliente NO se rompen entre sí.
- Ambas pueden apuntar al mismo proyecto de Supabase.
- El flujo recomendado es:
  - la web cliente envía solicitudes a Supabase
  - la admin local lee/escribe en Supabase
  - localStorage solo sirve como respaldo/caché

## 4) Si algo falla

- Verifica que las tablas existan en Supabase.
- Verifica que el anon key y la URL del proyecto sean correctos.
- Abre la consola del navegador para ver errores de Supabase.
