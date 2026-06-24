# Música de fondo

Suelta aquí tus pistas de música **libres de derechos** (royalty-free) en formato `.mp3`.
Shotstack las descarga por URL pública, así que en producción (Vercel) quedan servidas en
`https://sagaia.vercel.app/music/<archivo>.mp3`.

## Archivos esperados (uno por nicho + un default)

| Archivo | Nicho | Env var a setear |
|---|---|---|
| `default.mp3` | fallback (cualquiera) | `MUSIC_URL_DEFAULT=https://sagaia.vercel.app/music/default.mp3` |
| `terror.mp3` | terror / horror | `MUSIC_URL_TERROR=https://sagaia.vercel.app/music/terror.mp3` |
| `romance.mp3` | romance | `MUSIC_URL_ROMANCE=https://sagaia.vercel.app/music/romance.mp3` |
| `misterio.mp3` | misterio | `MUSIC_URL_MISTERIO=https://sagaia.vercel.app/music/misterio.mp3` |
| `inspiracional.mp3` | inspiracional | `MUSIC_URL_INSPIRACIONAL=https://sagaia.vercel.app/music/inspiracional.mp3` |
| `fantasia.mp3` | fantasia | `MUSIC_URL_FANTASIA=https://sagaia.vercel.app/music/fantasia.mp3` |
| `drama.mp3` | drama / historia | `MUSIC_URL_DRAMA=https://sagaia.vercel.app/music/drama.mp3` |

Con solo `default.mp3` ya tienes música en TODOS los videos. Los demás son opcionales
(afinan el mood por nicho). Si una URL no existe o no responde, el video se renderiza
sin música — nunca falla.

## Dónde conseguir música libre de derechos

- **Pixabay Music** (pixabay.com/music) — gratis, pero NO permite hotlink directo:
  descarga el `.mp3` y súbelo AQUÍ (no pongas la URL de Pixabay como env).
- **YouTube Audio Library** (studio.youtube.com → Audio Library) — gratis, descarga el mp3.
- **Free Music Archive**, **Incompetech** (Kevin MacLeod) — atribución según licencia.

Descarga el archivo, renómbralo (ej: `default.mp3`), déjalo en esta carpeta, haz commit
y deploy. Listo.

## En local

Para probar en `localhost`, usa la URL local en `.env.local`:
`MUSIC_URL_DEFAULT=http://localhost:3000/music/default.mp3`
