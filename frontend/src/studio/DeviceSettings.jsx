import { useMediaDeviceSelect } from '@livekit/components-react'

// Elegir cámara, micrófono y bocinas (lo usan el anfitrión y los invitados).
function DeviceSelect({ kind, label, onError }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    requestPermissions: true,
    onError: () => onError('No se pudo leer la lista de dispositivos.')
  })
  const fieldId = `dev-${kind}`
  return (
    <div className="stack">
      <label htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        value={activeDeviceId}
        onChange={(e) => setActiveMediaDevice(e.target.value).catch(() => onError('No se pudo cambiar el dispositivo.'))}
      >
        {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Dispositivo sin nombre'}</option>)}
      </select>
    </div>
  )
}

export default function DeviceSettings({ onError }) {
  return (
    <section className="settings card" aria-label="Ajustes de dispositivos">
      <DeviceSelect kind="videoinput" label="Cámara" onError={onError} />
      <DeviceSelect kind="audioinput" label="Micrófono" onError={onError} />
      <DeviceSelect kind="audiooutput" label="Bocinas" onError={onError} />
    </section>
  )
}
