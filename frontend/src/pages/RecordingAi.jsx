import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { formatClock } from '../studio/layouts.js'
import { formatBytes } from '../lib/format.js'
import { clipRange, youtubeDescription } from '../lib/aiText.js'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return 'Copiado.'
  } catch {
    return 'Tu navegador no dejó copiar. Selecciona el texto y cópialo.'
  }
}

// Lo que genera Kestrel IA al terminar: resumen, textos para redes, capítulos y clips.
export default function RecordingAi({ id, hasVideo, onSeek }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [clips, setClips] = useState({ items: [], ffmpeg: true })

  const loadClips = useCallback(
    () => api(`/recordings/${id}/clips`).then(setClips).catch(() => {}),
    [id]
  )

  useEffect(() => {
    api(`/recordings/${id}/ai`).then(setData).catch((e) => setError(e.message))
    loadClips()
  }, [id, loadClips])

  // Mientras haya clips recortándose, se revisa cada 3 s.
  const pending = clips.items.some((c) => !c.ready)
  useEffect(() => {
    if (!pending) return undefined
    const t = setInterval(loadClips, 3000)
    return () => clearInterval(t)
  }, [pending, loadClips])

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      setData(await api(`/recordings/${id}/ai`, { method: 'POST' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const makeClip = async (c) => {
    setError('')
    try {
      await api(`/recordings/${id}/clips`, { method: 'POST', body: { start: c.start, end: c.end } })
      await loadClips()
    } catch (e) {
      setError(e.message)
    }
  }

  const copy = async (text) => setNote(await copyText(text))

  if (!data) return error ? <p className="error" role="alert">{error}</p> : null
  const report = data.report
  const clipFor = (c) => clips.items.find((x) => x.name.endsWith(`-clip-${c.start}-${c.end}.mp4`))

  return (
    <section className="ai-report stack" aria-label="Kestrel IA">
      <div className="ai-head">
        <h2 className="display">Resumen generado por IA</h2>
        {data.segments > 0 && (
          <a className="btn" href={`/api/recordings/${id}/subtitles.srt`} download>Subtítulos (.srt)</a>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="muted small" role="status">{note}</p>}

      {!report ? (
        <div className="card stack">
          {data.segments >= 3 ? (
            <>
              <p className="muted">
                Hay {data.segments} frases transcritas. Kestrel IA puede escribir el resumen, la descripción para
                YouTube, un post para LinkedIn, los capítulos y sugerir clips verticales.
              </p>
              <button className="btn primary" onClick={generate} disabled={busy}>
                {busy ? 'Kestrel IA está trabajando… (puede tardar un minuto)' : '✨ Generar con Kestrel IA'}
              </button>
            </>
          ) : (
            <p className="muted">
              No hay transcripción de esta transmisión. La próxima vez activa <strong>Subtítulos en vivo</strong> en
              la pestaña Kestrel IA del estudio y aquí tendrás resumen, capítulos y clips.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="card stack">
            <p className="ai-summary">{report.summary}</p>
            <div className="actions">
              <button className="btn" onClick={() => copy(youtubeDescription(report))}>Copiar como descripción de YouTube</button>
              <button className="btn" onClick={() => copy(report.linkedin_post)}>Copiar post para LinkedIn</button>
              <button className="btn" onClick={generate} disabled={busy}>{busy ? 'Generando…' : 'Volver a generar'}</button>
            </div>
            <details>
              <summary>Ver post para LinkedIn</summary>
              <p className="pre">{report.linkedin_post}</p>
            </details>
          </div>

          {report.chapters.length > 0 && (
            <div className="card stack">
              <h2 className="display">Capítulos</h2>
              <ol className="chapters">
                {report.chapters.map((c) => (
                  <li key={c.start}>
                    <button className="chapter" onClick={() => onSeek(c.start)} disabled={!hasVideo}>
                      <span className="chapter-time">{formatClock(c.start)}</span>
                      <span>{c.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {report.clips.length > 0 && (
            <div className="card stack">
              <h2 className="display">Clips verticales sugeridos</h2>
              <p className="muted small">Listos para Reels, Shorts y TikTok (1080×1920). Se recortan en tu laptop con ffmpeg.</p>
              {!clips.ffmpeg && (
                <p className="error">Para recortar clips instala ffmpeg (en Windows: <code>winget install ffmpeg</code>) y reinicia Flask.</p>
              )}
              <div className="clip-grid">
                {report.clips.map((c) => {
                  const made = clipFor(c)
                  const url = made ? `/api/recordings/${id}/files/${encodeURIComponent(made.name)}` : ''
                  return (
                    <div className="clip-card" key={`${c.start}-${c.end}`}>
                      {made?.ready ? (
                        <video src={url} controls preload="metadata" className="clip-video" />
                      ) : (
                        <button className="clip-thumb" onClick={() => onSeek(c.start)} disabled={!hasVideo} aria-label={`Ver desde ${formatClock(c.start)}`}>
                          ▶ {formatClock(c.start)}
                        </button>
                      )}
                      <strong className="small">{c.title}</strong>
                      <span className="muted small">{clipRange(c)}</span>
                      <span className="muted small">{c.reason}</span>
                      {made?.ready ? (
                        <a className="btn small-btn primary" href={url} download={made.name}>Descargar ({formatBytes(made.size)})</a>
                      ) : made ? (
                        <span className="pill">Recortando…</span>
                      ) : (
                        <button className="btn small-btn" onClick={() => makeClip(c)} disabled={!hasVideo || !clips.ffmpeg}>
                          Crear clip vertical
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
