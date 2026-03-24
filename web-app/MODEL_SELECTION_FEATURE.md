# Model Selection Feature

## Overview
Added a comprehensive AI model selection feature to the Zen AI web application that allows users to choose from available AI models when sending chat messages.

## Implementation Details

### Backend Integration
- **API Endpoint**: `GET /chats/models`
  - Returns available models grouped by provider
  - Includes default model recommendation
  - Provides model metadata (name, description, context length, pricing)

### Frontend Components

#### 1. Model Types (`services/chatService.ts`)
```typescript
export interface AIModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export interface AIModelsResponse {
  items: AIModel[];
  defaultModel: string;
}
```

#### 2. ModelSelector Component (`components/chat/ModelSelector.tsx`)
A sophisticated dropdown component that:
- Fetches available models from the API
- Groups models by provider (OpenAI, Anthropic, Google, etc.)
- Formats provider and model names for display
- Shows default model with sparkle icon
- Supports two variants:
  - **Compact**: Minimal display for existing chats
  - **Full**: Detailed display with descriptions for new chats
- Includes loading states and error handling
- Persists selected model in component state

**Key Features:**
- **Provider Grouping**: Models organized by provider with formatted labels
- **Default Model Indicator**: Sparkle icon highlights recommended model
- **Responsive Design**: Adapts to compact/full modes
- **Smart Formatting**: Removes provider prefix from model names for cleaner display
- **Loading States**: Skeleton loader while fetching models
- **Error Handling**: Graceful fallback on API errors

#### 3. ChatWindow Integration
- Added `selectedModel` state to track user's model choice
- Integrated ModelSelector in two locations:
  - **New Chat View**: Full variant with centered positioning
  - **Existing Chat View**: Compact variant aligned to the right
- Passes selected model to `sendMessage` function
- Model selection persists across messages within a chat session

### Design Philosophy

The implementation follows the design standards specified in the project:

1. **Typography**: Uses existing Space Grotesk font system
2. **Color Scheme**: Leverages defined color variables (primary, muted-foreground, etc.)
3. **Motion**: Smooth transitions on hover and selection changes
4. **Spatial Composition**: Clean, uncluttered layout that integrates seamlessly
5. **Component Consistency**: Uses existing shadcn/ui Select components

### User Experience

#### New Chat Flow
1. User opens new chat
2. Model selector prominently displayed above input (full variant)
3. Default model automatically selected
4. User can browse models grouped by provider
5. Sparkle icon indicates recommended model
6. Selection persists for the chat session

#### Existing Chat Flow
1. Compact model selector in bottom-right corner
2. Doesn't interfere with chat history
3. Easy access to change model mid-conversation
4. Same provider grouping and formatting

### Technical Implementation

#### Service Layer
```typescript
class ChatService {
  async getModels(): Promise<AIModelsResponse> {
    const response = await BaseApiService.get<AIModelsResponse>('/chats/models');
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }
}
```

#### Hook Updates
Updated `useChat` hook to support model parameter:
```typescript
sendMessage: (
  content: string, 
  fileIds?: string[], 
  targetChatId?: string, 
  model?: string
) => Promise<void>
```

#### API Request
```typescript
const request: CreateMessageRequest = {
  uid: user.uid,
  content,
  fileIds,
  stream: true,
  model, // Selected model passed to backend
};
```

### Styling Details

- **Borders**: `border-border/60` for subtle separation
- **Background**: Semi-transparent with dark mode support
- **Hover States**: Smooth color transitions
- **Icons**: Hugeicons for consistency (AI icon, sparkles)
- **Spacing**: Follows existing spacing scale
- **Shadows**: Subtle shadow on dropdown for depth
- **Animations**: Fade-in effects on dropdown open

### Model Display Format

**Provider Names:**
- `openai` → "OpenAI"
- `anthropic` → "Anthropic"
- `google` → "Google"
- `meta-llama` → "Meta"
- `mistralai` → "Mistral AI"
- `z-ai` → "Z-AI"
- Others: Capitalized with hyphens as spaces

**Model Names:**
- Strips provider prefix (`openai/gpt-4` → `gpt-4`)
- Falls back to full ID if no slash present
- Shows context length in compact format (e.g., "128k context")

### Files Modified/Created

#### Created:
- `web-app/src/components/chat/ModelSelector.tsx` - Main component

#### Modified:
- `web-app/src/services/chatService.ts` - Added model types and API method
- `web-app/src/services/index.ts` - Exported new types
- `web-app/src/hooks/useChat.ts` - Added model parameter support
- `web-app/src/components/layout/ChatWindow.tsx` - Integrated ModelSelector

### Future Enhancements

Potential improvements:
1. **Model Search**: Filter models by name/provider in dropdown
2. **Model Favorites**: Star/pin frequently used models
3. **Per-Chat Default**: Remember last used model per chat
4. **Model Comparison**: Show side-by-side model capabilities
5. **Cost Estimation**: Display estimated cost based on model pricing
6. **Performance Indicators**: Show model speed/quality ratings
7. **Custom Models**: Support for user-configured models

### Testing Checklist

- [x] Models fetch successfully from API
- [x] Default model auto-selected on load
- [x] Provider grouping displays correctly
- [x] Model selection updates state
- [x] Selected model passed to chat API
- [x] Compact variant works in existing chats
- [x] Full variant works in new chats
- [x] Loading states display properly
- [x] Error states handled gracefully
- [x] No TypeScript errors
- [x] Responsive on different screen sizes
- [x] Accessible keyboard navigation
- [x] Dark mode compatibility

## Usage

Users can now:
1. Select their preferred AI model before sending messages
2. Switch models mid-conversation
3. See which model is recommended (default)
4. Browse models organized by provider
5. View model details (context length, descriptions)

The feature integrates seamlessly with the existing chat interface and maintains the app's design aesthetic.
