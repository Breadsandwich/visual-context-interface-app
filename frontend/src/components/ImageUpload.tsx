import { useRef, useCallback, useState } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import './ImageUpload.css'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const WEBP_QUALITY = 0.80

function generateId(): string {
  return crypto.randomUUID()
}

function convertToWebP(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/webp', WEBP_QUALITY))
    }
    img.onerror = () => reject(new Error('Failed to load image for conversion'))
    img.src = dataUrl
  })
}

export function ImageUpload() {
  const { uploadedImages, addUploadedImage, removeUploadedImage, showToast } = useInspectorStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const processFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        showToast(`Unsupported file type: ${file.type || 'unknown'}`)
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`)
        return
      }

      const reader = new FileReader()
      reader.onload = async () => {
        const originalDataUrl = reader.result as string
        try {
          const webpDataUrl = await convertToWebP(originalDataUrl)
          const baseName = file.name.replace(/\.[^.]+$/, '')
          addUploadedImage({
            id: generateId(),
            dataUrl: webpDataUrl,
            filename: `${baseName}.webp`,
            size: webpDataUrl.length
          })
        } catch {
          showToast(`Failed to convert ${file.name} to WebP`)
        }
      }
      reader.onerror = () => {
        showToast(`Failed to read file: ${file.name}`)
      }
      reader.readAsDataURL(file)
    })
  }, [addUploadedImage, showToast])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <div className="image-upload">
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="upload-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="17,8 12,3 7,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="upload-text">Drop images or click to upload</span>
        <span className="upload-hint">PNG, JPG, WebP — auto-converted to WebP (max 5MB)</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        onChange={handleFileChange}
        className="upload-input-hidden"
        aria-label="Upload images"
      />

      {uploadedImages.length > 0 && (
        <div className="upload-thumbnails">
          {uploadedImages.map((img) => (
            <div key={img.id} className="thumbnail-item">
              <img src={img.dataUrl} alt={img.filename} className="thumbnail-image" />
              <button
                className="thumbnail-remove"
                onClick={() => removeUploadedImage(img.id)}
                aria-label={`Remove ${img.filename}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <span className="thumbnail-name">{img.filename}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
