"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Mic, MicOff, Send, Upload, FileText, X, Loader2, Volume2, Square, Settings, Globe } from "lucide-react"
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
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [podcastStyle, setPodcastStyle] = useState<"gentle" | "lively" | "meditation" | "british">("gentle")
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "professional">("medium")
  const [isWebSearchOpen, setIsWebSearchOpen] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)
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
        difficulty: difficulty,
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
          voiceType: podcastStyle,
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

      // Auto-play the generated audio
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
    console.log("Attempting to play audio URL:", audioUrl)
    
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    try {
      const audio = new Audio()
      
      // Add cache buster to prevent 304 errors
      const cacheBuster = `t=${Date.now()}`
      const urlWithCacheBuster = audioUrl.includes('?') 
        ? `${audioUrl}&${cacheBuster}` 
        : `${audioUrl}?${cacheBuster}`
      
      console.log("Audio URL with cache buster:", urlWithCacheBuster)
      
      // Set CORS mode for cross-origin audio
      audio.crossOrigin = "anonymous"
      
      // Add load event listener
      audio.addEventListener('loadedmetadata', () => {
        console.log("Audio metadata loaded, duration:", audio.duration)
      })
      
      audio.addEventListener('canplay', () => {
        console.log("Audio can play")
      })
      
      audio.addEventListener('loadstart', () => {
        console.log("Audio loading started")
      })
      
      audio.addEventListener('loadeddata', () => {
        console.log("Audio data loaded")
      })
      
      audio.addEventListener('error', (e) => {
        const errorDetails = {
          error: audio.error,
          code: audio.error?.code,
          message: audio.error?.message,
          src: audio.src,
          networkState: audio.networkState,
          readyState: audio.readyState
        }
        console.error("Audio error event:", errorDetails)
        
        let errorMessage = '播放失敗'
        if (audio.error?.code === 1) errorMessage = '音檔載入中止'
        else if (audio.error?.code === 2) errorMessage = '網路錯誤'
        else if (audio.error?.code === 3) errorMessage = '音檔解碼失敗'
        else if (audio.error?.code === 4) errorMessage = '音檔格式不支援'
        
        setIsPlaying(false)
        setCurrentPlayingId(null)
        alert(`${errorMessage}\n錯誤代碼: ${audio.error?.code}\nURL: ${audioUrl}`)
      })
      
      audio.addEventListener('ended', () => {
        console.log("Audio playback ended")
        setIsPlaying(false)
        setCurrentPlayingId(null)
      })
      
      // Set source after adding event listeners
      audio.src = urlWithCacheBuster
      audioRef.current = audio
      
      // Preload the audio
      audio.load()
      
      // Set playing state
      setIsPlaying(true)
      setCurrentPlayingId(messageId)
      
      // Attempt to play
      const playPromise = audio.play()
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Audio playback started successfully")
          })
          .catch((err) => {
            console.error("Audio play failed:", err)
            setIsPlaying(false)
            setCurrentPlayingId(null)
            alert(`無法播放音檔: ${err.message}\n請確認您已授權音檔播放權限`)
          })
      }
    } catch (err) {
      console.error("Error creating audio:", err)
      setIsPlaying(false)
      setCurrentPlayingId(null)
      alert(`建立音檔播放器失敗: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
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
      // Stop any playing audio before recording
      if (audioRef.current && isPlaying) {
        stopAudio()
      }
      
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

  const removeFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== fileName))
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>, autoProcess: boolean = true) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    
    // Validate file type - support PDF and images
    const fileName = file.name.toLowerCase()
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    const isValidFile = allowedExtensions.some(ext => fileName.endsWith(ext))
    
    if (!isValidFile) {
      alert('Please upload a PDF or image file (JPG, PNG, GIF, WebP, BMP)')
      return
    }

    setIsUploadingPdf(true)

    try {
      console.log('Uploading file:', file.name, 'Auto process:', autoProcess)
      
      const formData = new FormData()
      formData.append('file', file)
      formData.append('auto_process', autoProcess.toString())

      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload file')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to upload file')
      }

      console.log('File upload response:', data)

      // Show success message
      const message = data.auto_processed 
        ? `File "${data.filename}" uploaded and processed successfully!` 
        : `File "${data.filename}" uploaded successfully!`
      
      alert(message)

      // Add to uploaded files list for display
      setUploadedFiles((prev) => [
        ...prev,
        { name: data.filename, content: `[File: ${data.filename}]` }
      ])

    } catch (error) {
      console.error('File upload failed:', error)
      alert(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploadingPdf(false)
      if (pdfInputRef.current) {
        pdfInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col h-screen">
      <div className="relative text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">Podcast +</h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-3">Speak or type to start a conversation</p>
        <Button
          variant="ghost"
          size="lg"
          className="absolute top-0 right-0"
          title="Settings"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Settings className="h-12 w-12" />
        </Button>
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
              message.role === "user" ? "bg-primary text-primary-foreground ml-16" : "bg-white mr-16",
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
          className="min-h-28 resize-none text-lg bg-white"
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
              ref={pdfInputRef}
              onChange={(e) => handlePdfUpload(e, true)}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,image/*"
              className="hidden"
            />
            <Button 
              variant="outline" 
              size="lg" 
              onClick={() => pdfInputRef.current?.click()} 
              disabled={isUploadingPdf}
              className="gap-2"
            >
              {isUploadingPdf ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              <span className="hidden sm:inline">{isUploadingPdf ? "Uploading..." : "Upload"}</span>
            </Button>

            <Button 
              variant="outline" 
              size="lg" 
              onClick={() => setIsWebSearchOpen(true)}
              className="gap-2"
            >
              <Globe className="h-5 w-5" />
              <span className="hidden sm:inline">Web Search</span>
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

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Podcast Settings</DialogTitle>
            <DialogDescription>
              Choose your preferred podcast style and content difficulty
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Podcast Style</Label>
              <RadioGroup value={podcastStyle} onValueChange={(value) => setPodcastStyle(value as typeof podcastStyle)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="gentle" id="gentle" />
                  <Label htmlFor="gentle" className="font-normal cursor-pointer">Gentle - Warm and friendly</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="lively" id="lively" />
                  <Label htmlFor="lively" className="font-normal cursor-pointer">Lively - Energetic and dynamic</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="meditation" id="meditation" />
                  <Label htmlFor="meditation" className="font-normal cursor-pointer">Meditation - Calm and relaxing</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="british" id="british" />
                  <Label htmlFor="british" className="font-normal cursor-pointer">British - British accent style</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Content Difficulty</Label>
              <RadioGroup value={difficulty} onValueChange={(value) => setDifficulty(value as typeof difficulty)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="easy" id="easy" />
                  <Label htmlFor="easy" className="font-normal cursor-pointer">Easy - Simple and accessible</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="medium" id="medium" />
                  <Label htmlFor="medium" className="font-normal cursor-pointer">Medium - Intermediate level</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hard" id="hard" />
                  <Label htmlFor="hard" className="font-normal cursor-pointer">Hard - Advanced</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="professional" id="professional" />
                  <Label htmlFor="professional" className="font-normal cursor-pointer">Professional - Expert level</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
