import { useInspectorStore } from '../stores/inspectorStore'
import { ImageUpload } from './ImageUpload'
import './InstructionInput.css'

export function InstructionInput() {
  const { userPrompt, setUserPrompt } = useInspectorStore()

  return (
    <div className="instruction-input">
      <label htmlFor="user-prompt">Instructions for Claude</label>
      <textarea
        id="user-prompt"
        value={userPrompt}
        onChange={(e) => setUserPrompt(e.target.value)}
        placeholder="Describe what you want Claude to do with the selected elements..."
        rows={4}
      />

      <label className="sub-label">Reference Images</label>
      <ImageUpload />
    </div>
  )
}
