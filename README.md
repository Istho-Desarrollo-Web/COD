# COD — Centro Operativo Documental (ISTHO S.A.S.)

Sistema hermano del CRM CenthriX: mismo lenguaje visual y convenciones
técnicas (ver `DESIGN_SYSTEM_CENTHRIX.md`), dominio propio de Compras,
Proveedores/Contratistas y Repositorio documental SGI.

## Documentación

- Diseño inicial (modelo de datos + estructura de carpetas):
  `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`
- Diseño del frontend (scaffold, auth, layout, Dashboard Inicio, Áreas):
  `docs/superpowers/specs/2026-07-06-cod-frontend-foundation-design.md`
- Integración futura con el CRM: `docs/architecture/crm-integration.md`

## Backend (`server/`)

```bash
cd server
npm install
cp .env.example .env   # completar JWT_SECRET, credenciales de MySQL, etc.
npm run migration:up   # o simplemente `npm start` — corre migraciones+seeds al arrancar
npm run dev
```

Tests (requieren MySQL local accesible, ver `server/.env.test`):

```bash
cd server
npm test
```

## Frontend (`frontend/`)

```bash
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_URL si el backend no corre en localhost:5000
npm run dev
```

Tests:

```bash
cd frontend
npm test
```
