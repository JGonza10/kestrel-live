// Cliente mínimo para la API de Flask. Envía el encabezado anti-CSRF que exige el backend.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'kestrel-live'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Algo salió mal.')
    err.status = res.status
    err.fields = data.fields
    throw err
  }
  return data
}
