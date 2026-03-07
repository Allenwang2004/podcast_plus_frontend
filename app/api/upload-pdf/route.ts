import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("Upload PDF API called")
    const formData = await request.formData()
    
    const file = formData.get("file") as File | null
    const autoProcess = formData.get("auto_process") === "true"
    
    console.log("File:", file?.name, "Auto process:", autoProcess)
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided", success: false },
        { status: 400 }
      )
    }
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: "Only PDF files are allowed", success: false },
        { status: 400 }
      )
    }
    
    // Prepare form data for backend
    const backendFormData = new FormData()
    backendFormData.append("file", file)
    backendFormData.append("auto_process", autoProcess.toString())
    
    console.log("Sending to backend...")
    
    // Send to backend
    const response = await fetch(`${process.env.backend_url}/api/v1/rag/upload-pdf`, {
      method: "POST",
      body: backendFormData,
    })
    
    console.log("Backend response status:", response.status)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Backend error:", errorData)
      throw new Error(`Backend API error: ${response.status} - ${errorData.detail || response.statusText}`)
    }
    
    const data = await response.json()
    console.log("Backend response data:", JSON.stringify(data, null, 2))
    
    return NextResponse.json(data)
    
  } catch (error) {
    console.error("API route error:", error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to upload PDF",
        success: false 
      },
      { status: 500 }
    )
  }
}
