# OpenAI Integration

This project now uses OpenAI as the primary AI provider instead of Ollama.

## Configuration

### Environment Variables

Set the following environment variables:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL_NAME=gpt-4o-mini  # Default model
OPENAI_BASE_URL=  # Optional: Custom base URL for OpenAI API
```

### Default Configuration

- **Model**: `gpt-4o-mini` (GPT-5 mini equivalent)
- **API Key**: Configured in `src/config/ai-config.ts`
- **Base URL**: Uses OpenAI's default API endpoint

## API Endpoints

The AI service is available at `/api/assistant/` with the following endpoints:

### Health Check
- `GET /api/assistant/health` - Check OpenAI connection status and memory sessions
- `GET /api/assistant/health/ping` - Test response time and model availability

### Testing
- `POST /api/assistant/test` - Simple "Hello" test
- `POST /api/assistant/test-format` - Test JSON response format
- `POST /api/assistant/warmup` - Warm up the model

### Memory Management
- `POST /api/assistant/clear-memory` - Clear conversation memory

### Main AI Service
- `POST /api/assistant/wrapperA` - Main AI wrapper endpoint (supports streaming)

## Request Format

```json
{
  "prompt": "Your question or request",
  "projectId": "optional-project-id",
  "vendor_selection": "Rockwell|Siemens|Beckhoff|Generic",
  "sessionId": "optional-session-id-for-memory",
  "stream": true|false
}
```

## Response Format

### Non-Streaming Response
```json
{
  "status": "ok|needs_input|error",
  "task_type": "qna|code_gen|code_edit|debug|optimize|calc|checklist|report",
  "assumptions": ["assumption1", "assumption2"],
  "answer_md": "Markdown formatted answer",
  "artifacts": {
    "code": [
      {
        "language": "ST",
        "vendor": "Rockwell",
        "compilable": true,
        "filename": "example.st",
        "content": "// ST code here"
      }
    ],
    "tables": [
      {
        "title": "Example Table",
        "schema": ["Column1", "Column2"],
        "rows": [["Value1", "Value2"]]
      }
    ],
    "citations": ["citation1", "citation2"]
  },
  "next_actions": ["action1", "action2"],
  "errors": []
}
```

### Streaming Response
The streaming response uses Server-Sent Events (SSE) format:

```
data: {"content": "Hello", "type": "chunk"}

data: {"content": " world", "type": "chunk"}

data: {"type": "end", "fullResponse": "Hello world"}

data: {"type": "error", "error": "Error message"}
```

## Conversation Memory

The AI now supports conversation memory across multiple requests using session IDs.

### How Memory Works

1. **Session Management**: Each `sessionId` maintains its own conversation history
2. **Automatic Expiry**: Sessions expire after 30 minutes of inactivity
3. **Context Limits**: Keeps last 20 messages to prevent context overflow
4. **Memory Persistence**: Memory is stored in server memory (not persistent across restarts)

### Memory Example

```javascript
// First request - introduce yourself
const response1 = await fetch('/api/assistant/wrapperA', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'I am Jana',
    sessionId: 'user-123'
  })
});

// Second request - AI remembers who you are
const response2 = await fetch('/api/assistant/wrapperA', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Who am I?',
    sessionId: 'user-123'  // Same session ID
  })
});
// AI will respond: "You are Jana"
```

## Streaming Support

The AI now supports real-time streaming responses for better user experience.

### Streaming Usage

```javascript
// Enable streaming
const response = await fetch('/api/assistant/wrapperA', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Tell me a story',
    sessionId: 'user-123',
    stream: true
  })
});

// Handle streaming response
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'chunk') {
          console.log(data.content); // Print each chunk
        } else if (data.type === 'end') {
          console.log('Streaming completed');
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }
}
```

## Testing

### Basic Test
```bash
node test-openai.js
```

### Streaming and Memory Test
```bash
node test-streaming-memory.js
```

Make sure the server is running on port 5000 before running the tests.

## Features

- **Circuit Breaker**: Automatically disables service after 3 consecutive failures
- **Timeout Protection**: 2-minute timeout for AI requests
- **JSON Response Format**: Uses OpenAI's `response_format: "json_object"` for reliable JSON output
- **Error Handling**: Comprehensive error handling with fallback responses
- **Schema Validation**: Validates responses against Zod schemas
- **Logging**: Detailed logging for debugging
- **Streaming**: Real-time streaming responses using Server-Sent Events
- **Conversation Memory**: Maintains context across multiple requests
- **Memory Management**: Automatic expiry and context limits

## Migration from Ollama

The project has been migrated from Ollama to OpenAI:

1. ✅ Removed Ollama dependency
2. ✅ Updated configuration to use OpenAI
3. ✅ Maintained same API interface
4. ✅ Updated routes to use `/api/assistant/`
5. ✅ Preserved all existing functionality
6. ✅ Added streaming support
7. ✅ Added conversation memory

## Troubleshooting

### Common Issues

1. **API Key Error**: Make sure your OpenAI API key is valid and has sufficient credits
2. **Model Not Available**: Ensure the specified model is available in your OpenAI account
3. **Rate Limiting**: OpenAI has rate limits - implement retry logic if needed
4. **Timeout**: Complex requests may timeout - check the 2-minute limit
5. **Memory Issues**: Memory is not persistent - sessions are lost on server restart
6. **Streaming Errors**: Check browser compatibility for Server-Sent Events

### Debug Logs

The service provides detailed logging:
- Request received: `🔔 /wrapperA OpenAI request received`
- Raw response: `🔍 Raw OpenAI response:`
- Processing time: `✅ OpenAI response in Xms`
- Circuit breaker: `🔴 Circuit breaker ON`
- Memory operations: Memory sessions count in health endpoint

## Security

- API keys are loaded from environment variables
- No hardcoded credentials in the codebase
- Request validation using Zod schemas
- Input sanitization and length limits
- Memory isolation between sessions
