export type ModelId = string

export type Model = {
  id: ModelId
  name: string
  command: string
  source: string
}

export type ModelFileSelection = Omit<Model, 'id'>

export type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  model?: ModelId
  createdAt: string
}
