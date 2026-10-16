import { VideoTrack } from '@livekit/components-react'
import Logo from '../components/Logo.jsx'
import { composeStage, initials } from './layouts.js'

// Una fuente del lienzo: video si lo hay, si no, las iniciales.
function Tile({ source, style, small }) {
  const ref = source.trackRef
  const hasVideo = Boolean(ref?.publication && !ref.publication.isMuted && ref.publication.track)
  return (
    <div className={`tile${source.isScreen ? ' screen' : ''}`}>
      {hasVideo ? (
        <VideoTrack trackRef={ref} className={source.isScreen ? 'fit-contain' : ''} />
      ) : (
        <span className={`avatar${small ? ' small' : ''}`} aria-hidden="true">{initials(source.name)}</span>
      )}
      {style.showNames && (
        <span className={`name-tag theme-${style.theme}`}>{source.isScreen ? `Pantalla de ${source.name}` : source.name}</span>
      )}
    </div>
  )
}

export default function Stage({ layout, onStage, style, banner, emptyText = 'Agrega a alguien a la escena desde Tras bastidores' }) {
  const comp = composeStage(layout, onStage)
  const brand = { '--brand': style.color }

  return (
    <div className="canvas" style={brand} aria-label="Lienzo de la transmisión">
      {comp.mode === 'empty' && emptyText && (
        <div className="canvas-empty">{emptyText}</div>
      )}

      {comp.mode === 'grid' && (
        <div
          className="canvas-grid"
          style={{ gridTemplateColumns: `repeat(${comp.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${comp.rows}, minmax(0, 1fr))` }}
        >
          {comp.tiles.map((s) => <Tile key={s.id} source={s} style={style} />)}
        </div>
      )}

      {comp.mode === 'pres' && (
        <div className="canvas-pres">
          <Tile source={comp.main} style={style} />
          <div className="canvas-side">
            {comp.side.map((s) => <Tile key={s.id} source={s} style={style} small />)}
          </div>
        </div>
      )}

      {style.showLogo && (
        <div className="canvas-logo"><Logo size={18} />Kestrel AI</div>
      )}

      {banner && <div className={`canvas-banner theme-${style.theme}`}>{banner}</div>}
    </div>
  )
}
