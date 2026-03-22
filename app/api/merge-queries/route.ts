import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()

		const previousQuery = typeof body.previous_query === "string" ? body.previous_query.trim() : ""
		const currentQuery = typeof body.current_query === "string" ? body.current_query.trim() : ""

		if (!currentQuery) {
			return NextResponse.json(
				{
					success: false,
					merged_query: "",
					message: "current_query is required",
				},
				{ status: 400 },
			)
		}

		// If no previous query, just return the current query
		if (!previousQuery) {
			return NextResponse.json({
				success: true,
				merged_query: currentQuery,
				message: "No previous query to merge",
			})
		}

		// Use OpenAI to intelligently merge the queries
		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a helpful assistant that merges two web search queries into one comprehensive query. The user previously searched for something, and now has a new search query. Your task is to combine both queries into a single, well-formed search query that captures the intent of both. Keep it concise and focused. Only return the merged query, nothing else.",
				},
				{
					role: "user",
					content: `Previous search query: "${previousQuery}"\nCurrent search query: "${currentQuery}"\n\nMerge these into one comprehensive search query:`,
				},
			],
			temperature: 0.7,
			max_tokens: 150,
		})

		const mergedQuery = completion.choices[0]?.message?.content?.trim() || currentQuery

		return NextResponse.json({
			success: true,
			merged_query: mergedQuery,
			message: "Queries merged successfully",
		})
	} catch (error) {
		console.error("Merge queries API error:", error)
		return NextResponse.json(
			{
				success: false,
				merged_query: "",
				message: error instanceof Error ? error.message : "Failed to merge queries",
			},
			{ status: 500 },
		)
	}
}
