Quick start:

from openrouter import OpenRouter

client = OpenRouter(
    api_key="YOUR_API_KEY",
    server_url="https://ai.hackclub.com/proxy/v1",
)

response = client.chat.send(
    model="qwen/qwen3-32b",
    messages=[
        {"role": "user", "content": "Tell me a joke."}
    ],
    stream=False,
)

print(response.choices[0].message.content)


## Configuration

The backend supports switching between different AI providers and servers through environment variables:

- `AI_PROVIDER`: Set to "openrouter" (default) or "hackclub"
- `AI_SERVER_URL`: The server URL to use (e.g., "https://ai.hackclub.com/proxy/v1" for Hack Club AI)
- `AI_API_KEY`: The API key for the chosen provider

For Hack Club AI:
```bash
AI_PROVIDER=hackclub
AI_SERVER_URL=https://ai.hackclub.com/proxy/v1
AI_API_KEY=your_hackclub_api_key
```

For OpenRouter (default):
```bash
AI_PROVIDER=openrouter
AI_SERVER_URL=https://openrouter.ai/api/v1
AI_API_KEY=your_openrouter_api_key
```

If `AI_API_KEY` is not set, it falls back to `OPENROUTER_API_KEY` for backward compatibility.


https://docs.ai.hackclub.com/llms.txt
# Hack Club AI

> Free AI APIs for teens

## Table of Contents

### Guide

- [Authentication](/guide/authentication.md)
- [Using with Vercel AI SDK](/guide/using-with-vercel-ai-sdk.md): Use Hack Club AI with Vercel AI SDK.
- [Web Search for AI](/guide/web-search.md): Add real-time web search to your AI applications.
- [Using Replicate Models](/guide/replicate.md): Learn how to use Replicate models with the Hack Club AI API.
- [Rules & Rate Limiting](/guide/rules.md)

### API Reference

- [Chat Completions](/api/chat-completions.md): Create chat completions (aka: talk to the AI) for conversations with AI models. Supports streaming and non-streaming modes.
- [Responses API](/api/responses.md): Create responses using the Responses API. Supports simple text input, structured messages, and streaming.
- [Image Generation](/api/image-generation.md): Generate images with AI
- [Image Inputs](/api/image-inputs.md): Send images to vision-capable models for analysis and understanding.
- [PDF Inputs](/api/pdf-inputs.md): Send PDF documents to any model for analysis and summarization.
- [Embeddings](/api/embeddings.md): Generate vector embeddings from text input. Use these embeddings for semantic search, clustering, or storing in vector databases like Pinecone or pgvector.
- [Get Models](/api/get-models.md): List all available models for chat completions and embeddings.
- [Token Stats](/api/stats.md): Get token usage statistics for your account.
- [Moderations](/api/moderations.md): Classify if text or images are potentially inappropriate (e.g., hate speech, violence, NSFW content).
- [OCR (Optical Character Recognition)](/api/ocr.md): Extract text and structured content from images and PDF documents using OCR.
- [Healthcheck](/api/healthcheck.md): Check if Hack Club AI is working and ready to serve requests.


### Other

- [Models List](/models-list.md)

