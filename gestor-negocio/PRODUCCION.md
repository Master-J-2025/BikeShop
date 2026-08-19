# Preparación para producción

## 1) Crear o verificar tablas en Supabase

Ejecuta el SQL de [supabase-schema.sql](supabase-schema.sql) en el SQL Editor de Supabase.

## 2) Verificar RLS

Si quieres que la app funcione sin autenticación, deja las políticas abiertas como en el script.

## 3) Publicar la app

Sirve esta carpeta con un servidor estático, por ejemplo:

```bash
python -m http.server 8001
```

Y abre:

```text
http://localhost:8001/
```

## 4) Qué ya está listo

- Panel administrativo con UI moderna
- Modo oscuro
- Supabase conectado para clientes, pedidos, facturas y configuración
- Branding configurable desde el panel
