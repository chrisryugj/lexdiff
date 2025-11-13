# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

```bash
# Setup (first time only)
./setup.sh

# Activate virtual environment
source venv/bin/activate

# Run the application
python main.py

# Deactivate when done
deactivate
```

## Architecture Overview

This is a modular Python application for RAG-based chat using Google Gemini API with File Search capabilities.

### Module Hierarchy

```
main.py
  └── ChatInterface (src/chat_interface.py)
        ├── GeminiChatClient (src/gemini_client.py)
        │     └── genai.Client (google-genai SDK)
        └── FileSearchManager (src/file_search_manager.py)
              └── genai.Client (google-genai SDK)
```

### Key Architectural Patterns

**Three-Layer Architecture:**
1. **UI Layer** (`chat_interface.py`) - Command parsing, user interaction, display formatting
2. **Business Logic Layer** (`gemini_client.py`, `file_search_manager.py`) - API wrappers, data processing
3. **External API Layer** (`google-genai` SDK) - Gemini API interactions

**State Management:**
- `ChatInterface` maintains `current_store` (selected file search store)
- `GeminiChatClient` maintains `chat` session and `file_search_store_names` list
- Chat history managed by SDK, not application

**Configuration Pattern:**
- Single `Config` class in `src/config.py` with class-level attributes
- Loads from `.env` via `python-dotenv`
- Validates on application start via `Config.validate()`

## Google GenAI SDK Usage Patterns

**CRITICAL:** This codebase uses the `google-genai` library (v1.49.0), NOT the deprecated `google-generativeai` library.

### Correct Import Pattern
```python
from google import genai
from google.genai import types
from google.genai.errors import APIError
```

### Client Initialization
```python
client = genai.Client(api_key=api_key)
```

### Chat Sessions
```python
# Create chat
chat = client.chats.create(model='gemini-2.5-flash')

# Send message with config
response = chat.send_message(
    message,
    config=types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[types.Tool(file_search=types.FileSearch(...))]
    )
)
```

### File Search Operations
```python
# Create store
store = client.file_search_stores.create(
    config={'display_name': display_name}
)

# Upload file (returns operation)
operation = client.file_search_stores.upload_to_file_search_store(
    file=str(file_path),
    file_search_store_name=store_name,
    config={'display_name': display_name}
)

# Monitor operation
while not operation.done:
    time.sleep(2)
    operation = client.operations.get(operation)
```

### Response Structure
```python
# Access response text
response.text

# Access grounding metadata (citations)
response.candidates[0].grounding_metadata.grounding_chunks
response.candidates[0].grounding_metadata.grounding_supports
```

## Data Flow Patterns

### File Upload Flow
1. User invokes `/upload-files` → `ChatInterface.cmd_upload_files()`
2. Scans `files/` directory for files
3. For each file: calls `FileSearchManager.upload_file_to_store()`
4. Creates async operation via `upload_to_file_search_store()`
5. Polls `operation.done` status every 2 seconds
6. Returns when all uploads complete

### Chat Message Flow
1. User types message → `ChatInterface.handle_chat_message()`
2. Builds `GenerateContentConfig` with:
   - `system_instruction` (from Config)
   - `thinking_config` (if enabled)
   - `tools` with FileSearch (if store selected)
3. Sends via `chat.send_message(message, config)`
4. Response includes `grounding_metadata` if File Search used
5. `GeminiChatClient.display_response()` formats text and citations

## Available Commands

All commands support both short and long forms (e.g., `/create` or `/create-store`).

### File Search Store Management
- `/create [name]` - Create a new file search store
- `/list` - List all file search stores
- `/select <name>` - Select a store for chat queries
- `/delete <name>` - Delete a file search store
- `/upload` - Upload files from 'files' directory
- `/store` - Show current store information

### Chat Commands
- `/start` - Start a new chat session
- `/reset` - Reset the current chat session
- `/history` - Show chat history
- `/export [filename]` - Export chat history as markdown file

### General
- `/help` - Show help message
- `/quit` or `/exit` - Exit the application

## Export Chat Feature

The `/export` (or `/export-chat`) command exports the entire conversation history to a markdown file:

**Usage:**
```bash
/export                         # Auto-generates filename with timestamp
/export my_conversation         # Custom filename (adds .md automatically)
/export report.md              # Explicit .md extension
```

**Output Location:** `exports/` directory (created automatically)

**Export Format:**
- Metadata header (timestamp, model, file search store)
- Conversation with `## You` and `## Assistant` headings
- Citations formatted as markdown lists
- Sources include document titles and URIs
- Grounding supports count included

**Implementation Details:**
- Exports to `exports/` directory in project root
- Filename format: `chat_export_YYYYMMDD_HHMMSS.md` (if no name provided)
- Automatically adds `.md` extension if missing
- Includes grounding metadata (citations) for file search responses
- Uses `ChatInterface.cmd_export_chat()` in `src/chat_interface.py:311`
- Helper method `_format_citations_markdown()` at `src/chat_interface.py:376`

## Adding New Commands

Add to `ChatInterface.handle_command()` in `src/chat_interface.py`:

```python
elif cmd == '/your-command':
    self.cmd_your_command(args)
```

Then implement handler method:
```python
def cmd_your_command(self, args: str):
    """Your command description."""
    # Implementation
```

Update `show_help()` to document the new command.

## Configuration Customization

Edit `src/config.py` class attributes:
- `MODEL_NAME` - Change Gemini model (must support File Search: gemini-2.5-flash, gemini-2.5-pro)
- `SYSTEM_INSTRUCTION` - Modify default behavior prompt
- `ENABLE_THINKING` - Toggle dynamic thinking (True/False)
- `THINKING_BUDGET` - Set thinking budget (None for default, 0 to disable, >0 for specific)
- `FILES_DIR` - Change upload directory path
- `FILE_SEARCH_STORE_PREFIX` - Change store naming prefix

**Note:** `THINKING_BUDGET=0` disables thinking. For `gemini-2.5-pro`, minimum is `128`.

## File Search Store Lifecycle

**Creation:**
- Stores created via `client.file_search_stores.create()`
- Auto-generates name like `fileSearchStores/abc123xyz`
- Optional `display_name` for human-readable identification

**File Upload:**
- Uses `uploadToFileSearchStore` API (direct upload, not separate upload then import)
- Files automatically chunked by Google (no manual chunking config in this implementation)
- Files processed asynchronously (monitor via operation status)
- Temporary `File` objects deleted after 48 hours; indexed data persists indefinitely

**Usage in Chat:**
- Pass store name(s) in `types.FileSearch(file_search_store_names=[...])`
- Multiple stores can be specified in list
- Model performs semantic search across all specified stores

**Deletion:**
- `client.file_search_stores.delete(name=..., config={'force': True})`
- `force=True` deletes even if contains files
- Confirmation required in UI (`cmd_delete_store`)

## Citation Display Logic

Citations extracted from `grounding_metadata` in `_display_citations()`:

1. **Search Queries:** `grounding_metadata.search_entry_point.rendered_content`
2. **Grounding Chunks:** Documents/sources used
   - For web results: `chunk.web.title`, `chunk.web.uri`
   - For file search: `chunk.retrieved_context.uri`, `chunk.retrieved_context.title`
3. **Grounding Supports:** Number of grounded segments

## Error Handling Pattern

All API calls wrapped in try/except with `APIError`:

```python
from google.genai.errors import APIError

try:
    result = client.some_api_call()
except APIError as e:
    print(f"Error: {e}")
    return None  # or appropriate fallback
```

UI layer continues running on errors (graceful degradation).

## Environment Setup

**Required:** `.env` file with:
```
GEMINI_API_KEY=your_api_key_here
```

**Virtual Environment:**
- Created in `venv/` directory
- Dependencies in `requirements.txt`: `google-genai==1.49.0`, `python-dotenv==1.2.1`
- Always activate before running: `source venv/bin/activate`

## Files Directory

- Location: `files/` in project root
- Purpose: Source files for upload to file search stores
- Supported formats: PDF, TXT, DOCX, JSON, YAML, code files (.py, .js, etc.)
- Max file size: 100 MB per file
- Usage: Place files here, then use `/upload-files` command

## Model Configuration Constraints

**Gemini 2.5 Flash** (default):
- Supports dynamic thinking (enabled by default)
- Thinking can be disabled: `thinking_budget=0`
- Supports File Search
- Supports system instructions

**Important:** Do not attempt to set thinking config on non-2.5 models (will cause errors).

## Extension Points

**New Tool Integration:**
Add to `GeminiChatClient.send_message()` config params:
```python
config_params['tools'] = [
    types.Tool(file_search=...),
    types.Tool(your_new_tool=...)
]
```

**Custom Chunking:**
Modify `FileSearchManager.upload_file_to_store()` config:
```python
config={
    'display_name': display_name,
    'chunking_config': {
        'white_space_config': {
            'max_tokens_per_chunk': 200,
            'max_overlap_tokens': 50
        }
    }
}
```

**Streaming Responses:**
Replace `chat.send_message()` with streaming version in `gemini_client.py`:
```python
response = client.models.generate_content_stream(
    model=self.model_name,
    contents=message,
    config=config
)
for chunk in response:
    print(chunk.text, end='')
```

## Rate Limits and Costs

**File Search Limits:**
- 10 stores per project
- 100 MB max file size
- Total storage: 1 GB (Free), 10 GB (Tier 1), 100 GB (Tier 2), 1 TB (Tier 3)
- Recommended: Keep stores under 20 GB for optimal performance

**Pricing:**
- Storage: FREE
- Embeddings at indexing: $0.15 per 1M tokens
- Query embeddings: FREE
- Generation: Standard Gemini API pricing

## Debugging

**API Key Issues:**
- Verify `.env` exists in project root
- Check `GEMINI_API_KEY` is set (no quotes)
- Test: `python -c "from src.config import Config; Config.validate()"`

**Import Errors:**
- Ensure venv activated: `source venv/bin/activate`
- Reinstall: `pip install -r requirements.txt`

**File Upload Failures:**
- Check file exists in `files/` directory
- Verify file size < 100 MB
- Ensure file format supported
- Check API quota/rate limits

**Chat Not Using File Search:**
- Verify store selected: `/store-info`
- Check chat started after store selection: `/start-chat`
- Confirm files uploaded: `/list-stores` shows store

## Key Differences from Legacy SDK

If migrating from `google-generativeai`:
- ❌ `import google.generativeai as genai` → ✅ `from google import genai`
- ❌ `genai.configure(api_key=...)` → ✅ `client = genai.Client(api_key=...)`
- ❌ `model = genai.GenerativeModel(...)` → ✅ `chat = client.chats.create(model=...)`
- ❌ `model.generate_content(...)` → ✅ `chat.send_message(...)`
- ❌ `genai.GenerationConfig(...)` → ✅ `types.GenerateContentConfig(...)`
