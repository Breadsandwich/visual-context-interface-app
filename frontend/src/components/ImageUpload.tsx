import { useRef, useCallback, useState, useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { saveImageToDisk } from '../utils/imageSaver'
import './ImageUpload.css'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
function generateId(): string {
  return crypto.randomUUID()
}

function truncateSelector(selector: string, maxLen = 30): string {
  return selector.length > maxLen ? selector.slice(0, maxLen - 1) + '\u2026' : selector
}

export function ImageUpload() {
  const uploadedImages = useInspectorStore((s) => s.uploadedImages)
  const selectedElements = useInspectorStore((s) => s.selectedElements)
  const addUploadedImage = useInspectorStore((s) => s.addUploadedImage)
  const removeUploadedImage = useInspectorStore((s) => s.removeUploadedImage)
  const linkImageToElement = useInspectorStore((s) => s.linkImageToElement)
  const setImageFilePath = useInspectorStore((s) => s.setImageFilePath)
  const showToast = useInspectorStore((s) => s.showToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [isDragging, setIsDragging] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  useEffect(() => {
    if (!openDropdownId) return
    const handleMouseDown = (e: MouseEvent) => {
      const wrapper = dropdownRefs.current.get(openDropdownId)
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [openDropdownId])

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
      reader.onload = () => {
        const dataUrl = reader.result as string
        const imageId = generateId()
        addUploadedImage({
          id: imageId,
          dataUrl,
          filename: file.name,
          size: dataUrl.length
        })
        saveImageToDisk(dataUrl, 'upload')
          .then(({ filePath }) => setImageFilePath(imageId, filePath))
          .catch(() => showToast('Failed to save image to disk'))
      }
      reader.onerror = () => {
        showToast(`Failed to read file: ${file.name}`)
      }
      reader.readAsDataURL(file)
    })
  }, [addUploadedImage, setImageFilePath, showToast])

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

  const handleLinkClick = (imageId: string) => {
    setOpenDropdownId((prev) => (prev === imageId ? null : imageId))
  }

  const handleSelectElement = (imageId: string, selector: string) => {
    linkImageToElement(imageId, selector)
    setOpenDropdownId(null)
  }

  const handleUnlink = (imageId: string) => {
    linkImageToElement(imageId, null)
    setOpenDropdownId(null)
  }

  const setDropdownRef = (id: string, el: HTMLDivElement | null) => {
    if (el) {
      dropdownRefs.current.set(id, el)
    } else {
      dropdownRefs.current.delete(id)
    }
  }

  const hasImages = uploadedImages.length > 0

  return (
    <div className="image-upload">
      {!hasImages && (
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
          <span className="upload-hint">PNG, JPG, WebP (max 5MB)</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        onChange={handleFileChange}
        className="upload-input-hidden"
        aria-label="Upload images"
      />

      {hasImages && (
        <div className="upload-thumbnails">
          {uploadedImages.map((img) => {
            const isLinked = Boolean(img.linkedElementSelector)
            const isDropdownOpen = openDropdownId === img.id

            return (
              <div key={img.id} className={`thumbnail-item ${isLinked ? 'linked' : ''}`}>
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

                <div
                  className="thumbnail-link-wrapper"
                  ref={(el) => setDropdownRef(img.id, el)}
                >
                  <button
                    className={`thumbnail-link ${isLinked ? 'active' : ''}`}
                    onClick={() => handleLinkClick(img.id)}
                    aria-label={`Link ${img.filename} to element`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {isDropdownOpen && (
                    <div className="link-dropdown">
                      {isLinked && (
                        <button
                          className="link-dropdown-item unlink"
                          onClick={() => handleUnlink(img.id)}
                        >
                          Unlink
                        </button>
                      )}
                      {selectedElements.length === 0 ? (
                        <div className="link-dropdown-empty">No elements selected</div>
                      ) : (
                        selectedElements.map((el, index) => (
                          <button
                            key={el.selector}
                            className="link-dropdown-item"
                            onClick={() => handleSelectElement(img.id, el.selector)}
                          >
                            <span className="element-number">{index + 1}</span>
                            <span className="tag-pill">{el.tagName}</span>
                            <span className="selector-text">{truncateSelector(el.selector)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <span className="thumbnail-name">{img.filename}</span>
                {img.linkedElementSelector && (
                  <span className="thumbnail-linked-to">
                    {truncateSelector(img.linkedElementSelector, 24)}
                  </span>
                )}
              </div>
            )
          })}

          <div
            className={`upload-add-tile ${isDragging ? 'dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Upload more images"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
