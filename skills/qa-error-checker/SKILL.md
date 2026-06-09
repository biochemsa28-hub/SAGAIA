---
name: qa-error-checker
version: 1.0.0
category: qa-testing
trigger: "después de cada módulo completado, antes de marcar como listo"
model_recommendation: N/A (proceso de QA, no llama a AI)
---

# Skill: QA Error Checker

## Descripción
Checklist de QA que debe ejecutarse después de completar cada módulo.
Verifica TypeScript, lint, tests, y documentación antes de marcar como completado.

## Cuándo Usarla
- Después de completar cualquier módulo
- Antes de merge/push
- Cuando se reportan bugs en producción

## Comandos de QA

```bash
# 1. TypeScript check
npx tsc --noEmit

# 2. ESLint
npx next lint

# 3. Vitest (unit tests)
npx vitest run

# 4. Test coverage
npx vitest run --coverage

# 5. Playwright (E2E) — solo si servidor corriendo
npx playwright test

# 6. Build check
npx next build
```

## Checklist por Módulo

### Cualquier Servicio/API
- [ ] TypeScript compila sin errores
- [ ] Sin errores de lint
- [ ] Test unitario del happy path
- [ ] Test del caso de error/fallo
- [ ] Test del mock adapter
- [ ] Zod validation en inputs
- [ ] Error handling explícito (no catch vacíos)

### API Routes
- [ ] Retorna status codes correctos (200/422/500)
- [ ] Valida body con Zod antes de procesar
- [ ] Rate limiting aplicado
- [ ] No expone API keys o datos sensibles
- [ ] Maneja timeout correctamente

### Componentes React
- [ ] Props tipadas con TypeScript
- [ ] Loading state manejado
- [ ] Error state manejado
- [ ] Sin console.log en producción
- [ ] Accesibilidad básica (aria labels en botones)

### Base de Datos
- [ ] Migrations son reversibles (UP y DOWN)
- [ ] Indexes en columnas de búsqueda frecuente
- [ ] No hay raw string concatenation en queries (SQL injection)
- [ ] Timestamps en todas las tablas

## Output de QA Report
Después de cada módulo, documentar:
```markdown
## QA Report: [Módulo]
**Fecha:** 2026-06-08
**Estado:** ✅ PASS | ❌ FAIL | ⚠️ WARNINGS

### TypeScript: ✅
### Lint: ✅
### Tests: ✅ (X passed, Y skipped)
### Coverage: XX%

### Issues encontrados:
- [issue 1]

### Pendiente para próximo módulo:
- [item 1]
```

## Errores Comunes por Módulo
| Módulo | Error Frecuente | Fix |
|---|---|---|
| story-generator | JSON repair no cubre todos los casos | Ampliar regex de reparación |
| API routes | Missing await en async functions | TypeScript strict lo detecta |
| DB queries | Falta PRAGMA foreign_keys=ON | Activar en conexión SQLite |
| Storage | Path traversal en file names | Sanitizar nombres con uuid |
| Export | ZIP corruption en archivos grandes | Usar streams, no buffers |
