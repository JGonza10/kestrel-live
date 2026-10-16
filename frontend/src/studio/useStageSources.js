import { useMemo } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'

// Fuentes de video de la sala: la cámara de cada persona y las pantallas compartidas.
// Lo usan el estudio, la página del invitado y la página de salida (Egress).
export function useStageSources() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  )
  return useMemo(
    () =>
      tracks.map((ref) => ({
        id: `${ref.participant.identity}:${ref.source}`,
        isScreen: ref.source === Track.Source.ScreenShare,
        isLocal: ref.participant.isLocal,
        identity: ref.participant.identity,
        name: ref.participant.name || ref.participant.identity,
        trackRef: ref
      })),
    [tracks]
  )
}
