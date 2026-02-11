interface SaveImageResponse {
  filePath: string
  filename: string
}

export async function saveImageToDisk(
  dataUrl: string,
  source: string
): Promise<SaveImageResponse> {
  const response = await fetch('/api/save-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, source })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error ?? 'Failed to save image')
  }

  return response.json()
}

export async function deleteImageFromDisk(filename: string): Promise<void> {
  await fetch(`/api/delete-image?filename=${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  })
}

export async function clearTempImages(): Promise<void> {
  const response = await fetch('/api/clear-images', { method: 'DELETE' })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error ?? 'Failed to clear images')
  }
}
