"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Mic, MicOff, Send, Upload, FileText, X, Loader2, Volume2, Square } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  audioData?: string | null
  audioUrl?: string | null
  audioId?: string | null
  isGeneratingAudio?: boolean
}

interface UploadedFile {
  name: string
  content: string
}

export function PodcastInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioQueueRef = useRef<string[]>([])

  const playAudioWithCallback = (audioData: string, messageId: string, onEnd?: () => void) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(`data:audio/wav;base64,${audioData}`)
    audioRef.current = audio
    setIsPlaying(true)
    setCurrentPlayingId(messageId)

    audio.onended = () => {
      setIsPlaying(false)
      setCurrentPlayingId(null)
      onEnd?.()
    }

    audio.onerror = () => {
      setIsPlaying(false)
      setCurrentPlayingId(null)
      onEnd?.()
    }

    audio.play().catch((err) => {
      console.error("Auto-play failed:", err)
      setIsPlaying(false)
      setCurrentPlayingId(null)
      onEnd?.()
    })
  }

  const sendToBackend = async (input: { type: "text"; text: string } | { type: "audio"; audioBlob: Blob }) => {
    setIsLoading(true)

    try {
      // For now, only support text input since backend doesn't handle audio
      if (input.type === "audio") {
        console.error("Audio input not yet supported by backend")
        return
      }

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: input.text,
      }
      setMessages((prev) => [...prev, userMessage])

      // Prepare request body
      const requestBody = {
        userInstruction: input.text,
        retrievedContext: uploadedFiles.map((f) => f.content).join("\n\n"),
        model: "gpt-4o-mini",
        maxTokens: 1000,
      }

      const response = await fetch("/api/podcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error("API request failed")
      }

      const data = await response.json()

      // Check if request was successful
      if (!data.success) {
        throw new Error(data.message || "Failed to generate dialogue")
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.dialogue,
        audioData: null,
        audioUrl: null,
        audioId: data.audio_id,
        isGeneratingAudio: false,
      }
      setMessages((prev) => [...prev, assistantMessage])

    } catch (error) {
      console.error("Request failed:", error)
      // Show error message to user
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to generate response"}`,
        audioData: null,
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const playAudio = (audioData: string, messageId: string) => {
    playAudioWithCallback(audioData, messageId)
  }

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      setCurrentPlayingId(null)
    }
  }

  const generateAudio = async (messageId: string, dialogue: string, audioId: string) => {
    try {
      console.log("Generating audio for message:", messageId)
      
      // Update message to show generating state
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isGeneratingAudio: true } : msg
        )
      )

      const response = await fetch("/api/generate-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dialogue: dialogue,
          audioId: audioId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate audio")
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || "Failed to generate audio")
      }

      console.log("Audio generated:", data.audio_url)

      // Update message with audio URL and auto-play
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, audioUrl: data.audio_url, isGeneratingAudio: false }
            : msg
        )
      )

      // Auto-play the audio
      playAudioUrl(data.audio_url, messageId)

    } catch (error) {
      console.error("Failed to generate audio:", error)
      // Reset generating state on error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isGeneratingAudio: false } : msg
        )
      )
      alert(`Failed to generate audio: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const playAudioUrl = (audioUrl: string, messageId: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(audioUrl)
    audioRef.current = audio
    setIsPlaying(true)
    setCurrentPlayingId(messageId)

    audio.onended = () => {
      setIsPlaying(false)
      setCurrentPlayingId(null)
    }

    audio.onerror = () => {
      setIsPlaying(false)
      setCurrentPlayingId(null)
      console.error("Audio playback error")
    }

    audio.play().catch((err) => {
      console.error("Audio play failed:", err)
      setIsPlaying(false)
      setCurrentPlayingId(null)
    })
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    
    try {
      console.log("Starting transcription, audio blob size:", audioBlob.size)
      
      const formData = new FormData()
      formData.append("audio", audioBlob, "recording.webm")

      const response = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      })

      console.log("STT response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("STT response error:", errorText)
        throw new Error("STT request failed")
      }

      const data = await response.json()
      console.log("STT response data:", data)

      if (!data.success) {
        throw new Error(data.error || "Failed to transcribe audio")
      }

      console.log("Setting input text to:", data.text)
      // Set the transcribed text to input field
      setInput(data.text)

    } catch (error) {
      console.error("Transcription failed:", error)
      alert(`Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsTranscribing(false)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
        stream.getTracks().forEach((track) => track.stop())
        await transcribeAudio(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("Failed to start recording:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return
    const text = input
    setInput("")
    await sendToBackend({ type: "text", text })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const text = await file.text()
      setUploadedFiles((prev) => [...prev, { name: file.name, content: text }])
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== fileName))
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col h-screen">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">Podcast +</h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-3">Speak or type to start a conversation</p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {uploadedFiles.map((file) => (
            <div key={file.name} className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-full text-base">
              <FileText className="h-4 w-4" />
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                onClick={() => removeFile(file.name)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-5 mb-8">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-lg">Start a conversation...</p>
          </div>
        )}
        {messages.map((message) => (
          <Card
            key={message.id}
            className={cn(
              "p-5",
              message.role === "user" ? "bg-primary text-primary-foreground ml-16" : "bg-muted mr-16",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2 uppercase tracking-wide opacity-70">
                  {message.role === "user" ? "You" : "Podcast"}
                </p>
                <p className="text-lg leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === "assistant" && (
                <div className="flex gap-2 shrink-0">
                  {/* Generate Audio Button */}
                  {message.audioId && !message.audioUrl && !message.isGeneratingAudio && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => generateAudio(message.id, message.content, message.audioId!)}
                      title="Generate audio"
                    >
                      <Volume2 className="h-5 w-5" />
                    </Button>
                  )}
                  
                  {/* Generating Audio Spinner */}
                  {message.isGeneratingAudio && (
                    <Button variant="outline" size="icon" disabled>
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </Button>
                  )}
                  
                  {/* Play/Stop Audio Button */}
                  {message.audioUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        currentPlayingId === message.id ? stopAudio() : playAudioUrl(message.audioUrl!, message.id)
                      }
                      title={currentPlayingId === message.id ? "Stop audio" : "Play audio"}
                    >
                      {currentPlayingId === message.id && isPlaying ? (
                        <Square className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </Button>
                  )}
                  
                  {/* Legacy audioData support */}
                  {message.audioData && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        currentPlayingId === message.id ? stopAudio() : playAudio(message.audioData!, message.id)
                      }
                    >
                      {currentPlayingId === message.id && isPlaying ? (
                        <Square className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
        {isLoading && (
          <Card className="p-5 bg-muted mr-16">
            <p className="text-sm font-semibold mb-2 uppercase tracking-wide opacity-70">Podcast</p>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-lg">Generating response...</span>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="min-h-28 resize-none text-lg"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="lg"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading || isTranscribing}
              className="gap-2"
            >
              {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              <span className="hidden sm:inline">{isRecording ? "Stop" : "Voice"}</span>
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.md,.json,.csv"
              multiple
              className="hidden"
            />
            <Button variant="outline" size="lg" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-5 w-5" />
              <span className="hidden sm:inline">Upload</span>
            </Button>

            {isRecording && <span className="text-base text-destructive animate-pulse font-medium">Recording...</span>}
            {isTranscribing && <span className="text-base text-primary animate-pulse font-medium">Transcribing...</span>}
          </div>

          <Button size="lg" onClick={handleSubmit} disabled={!input.trim() || isLoading} className="px-6">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            <span className="ml-2 text-base">Send</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
