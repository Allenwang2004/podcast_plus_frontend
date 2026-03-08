import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("Generate dialogue API called")
    const body = await request.json()
    
    console.log("Request body:", JSON.stringify(body, null, 2))
    
    // Extract data
    const { userInstruction, model, maxTokens } = body
    
    // Prepare request body for backend API
    const backendRequestBody = {
      user_instruction: userInstruction,
      model: model || "gpt-4o-mini",
      max_tokens: maxTokens || 1000,
    }
    
    console.log("Sending to backend:", JSON.stringify(backendRequestBody, null, 2))
    
    // Use host.docker.internal for Docker containers to access host machine
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8001"
    console.log("Backend URL:", backendUrl)
    
    // Send POST request to backend
    const response = await fetch(`${backendUrl}/api/v1/podcast/generate-dialogue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendRequestBody),
    })
    
    console.log("Backend response status:", response.status)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Backend error:", errorData)
      throw new Error(`Backend API error: ${response.status} - ${errorData.detail || response.statusText}`)
    }
    
    const data = await response.json()
    console.log("Backend response data:", JSON.stringify(data, null, 2))
    
    // Return the response
    return NextResponse.json(data)
    
  } catch (error) {
    console.error("API route error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 }
    )
  }
}
