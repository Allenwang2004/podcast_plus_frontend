import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(request: NextRequest) {
  try {
    console.log("STT API called")
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File | null

    console.log("Audio file received:", {
      name: audioFile?.name,
      size: audioFile?.size,
      type: audioFile?.type
    })

    if (!audioFile) {
      console.error("No audio file provided")
      return NextResponse.json(
        { error: "No audio file provided", success: false },
        { status: 400 }
      )
    }

    // Validate file type
    const validTypes = ["audio/wav", "audio/webm", "audio/mp3", "audio/mpeg"]
    if (!validTypes.includes(audioFile.type) && !audioFile.name.match(/\.(wav|webm|mp3)$/i)) {
      console.error("Invalid file type:", audioFile.type)
      return NextResponse.json(
        { error: "Invalid audio file format. Supported: WAV, WebM, MP3", success: false },
        { status: 400 }
      )
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024
    if (audioFile.size > maxSize) {
      console.error("File too large:", audioFile.size)
      return NextResponse.json(
        { error: "Audio file too large. Maximum size: 10MB", success: false },
        { status: 400 }
      )
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    console.log("Calling Whisper API...")

    // Convert File to format OpenAI expects
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const file = new File([buffer], audioFile.name, { type: audioFile.type })

    // Transcribe audio using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      // Remove language to auto-detect, or try "en" if speaking English
      // language: "zh",
    })

    console.log("Transcription result:", transcription.text)
    console.log("Full transcription object:", JSON.stringify(transcription, null, 2))

    // Check if transcription is empty
    if (!transcription.text || transcription.text.trim() === "") {
      console.warn("Warning: Transcription returned empty text")
      return NextResponse.json({
        success: false,
        error: "No speech detected in audio. Please try speaking louder or closer to the microphone.",
        text: "",
      })
    }

    const response = {
      success: true,
      text: transcription.text,
    }

    console.log("Sending response:", response)

    return NextResponse.json(response)

  } catch (error) {
    console.error("STT error:", error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to transcribe audio",
        success: false,
      },
      { status: 500 }
    )
  }
}
