import { NextRequest, NextResponse } from "next/server"

interface SearchResultItem {
	title: string
	url: string
	content: string
	score: number
}

interface SearchToolResponse {
	success: boolean
	results: SearchResultItem[]
	formatted_context: string
	message: string
}

export async function POST(request: NextRequest) {
	try {
		console.log("Web search API called")
		const body = await request.json()

		const query = typeof body.query === "string" ? body.query.trim() : ""
		const maxResults = Number.isInteger(body.max_results) ? body.max_results : 3

		if (!query) {
			return NextResponse.json(
				{
					success: false,
					results: [],
					formatted_context: "",
					message: "query is required",
				} satisfies SearchToolResponse,
				{ status: 400 },
			)
		}

		const backendRequestBody = {
			query,
			max_results: maxResults,
		}

		const backendUrl = process.env.BACKEND_URL || "http://localhost:8001"
		const response = await fetch(`${backendUrl}/api/v1/search-tool/web-search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(backendRequestBody),
		})

		const data = await response.json().catch(() => ({}))

		if (!response.ok) {
			return NextResponse.json(
				{
					success: false,
					results: [],
					formatted_context: "",
					message: data.detail || data.message || response.statusText || "Web search failed",
				} satisfies SearchToolResponse,
				{ status: response.status },
			)
		}

		const normalizedResponse: SearchToolResponse = {
			success: Boolean(data.success),
			results: Array.isArray(data.results) ? data.results : [],
			formatted_context: typeof data.formatted_context === "string" ? data.formatted_context : "",
			message: typeof data.message === "string" ? data.message : "Web search completed",
		}

		return NextResponse.json(normalizedResponse)
	} catch (error) {
		console.error("Web search API route error:", error)
		return NextResponse.json(
			{
				success: false,
				results: [],
				formatted_context: "",
				message: error instanceof Error ? error.message : "Failed to perform web search",
			} satisfies SearchToolResponse,
			{ status: 500 },
		)
	}
}
