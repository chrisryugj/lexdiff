# Gemini File Search Chat Application

A modular Python application that provides an interactive text-based chat interface using Google Gemini API with File Search capabilities for Retrieval Augmented Generation (RAG).

## Features

- **Google Gemini 2.5 Flash Model** with dynamic thinking enabled
- **File Search Tool** for RAG-based conversations
- **System Instructions** to guide model behavior
- **Interactive Chat Interface** with command support
- **File Search Store Management** (create, list, delete stores)
- **File Upload** to search stores from a local directory
- **Citation Display** showing grounding metadata from responses
- **Chat History** tracking and display
- **Chat Export** to markdown files with citations preserved

## Requirements

- Python 3.12 or higher
- Google Gemini API key

## Installation

### 1. Get a Gemini API Key

Get your API key from [Google AI Studio](https://aistudio.google.com/app/u/0/api-keys)

### 2. Setup the Application

Run the setup script:

```bash
./setup.sh
```

This will:
- Create a Python virtual environment
- Install required dependencies
- Create a `.env` template file (if not exists)

### 3. Configure API Key

Edit the `.env` file and add your API key:

```
GEMINI_API_KEY=your_actual_api_key_here
```

## Project Structure

```
claude-file/
├── main.py                  # Application entry point
├── setup.sh                 # Setup script
├── requirements.txt         # Python dependencies
├── .env                     # Environment variables (API key)
├── README.md               # This file
├── CLAUDE.md               # Instructions for Claude Code
├── files/                  # Directory for files to upload to File Search
├── exports/                # Exported chat conversations (auto-created)
└── src/
    ├── __init__.py
    ├── config.py           # Configuration module
    ├── gemini_client.py    # Gemini API client wrapper
    ├── file_search_manager.py  # File Search store manager
    └── chat_interface.py   # Interactive chat interface
```

## Usage

### Starting the Application

1. Activate the virtual environment:
```bash
source venv/bin/activate
```

2. Run the application:
```bash
python main.py
```

### Available Commands

#### File Search Store Management

- `/create [name]` - Create a new file search store
- `/list` - List all file search stores
- `/select <name>` - Select a store for chat queries
- `/delete <name>` - Delete a file search store
- `/upload` - Upload files from the 'files' directory
- `/store` - Show current store information

#### Chat Commands

- `/start` - Start a new chat session
- `/reset` - Reset the current chat session
- `/history` - Show chat history
- `/export [filename]` - Export chat history as markdown file

#### General Commands

- `/help` - Show help message
- `/quit` or `/exit` - Exit the application

**Note:** Commands support both short forms (e.g., `/create`) and long forms (e.g., `/create-store`) for backward compatibility.

### Example Workflow

1. **Create a File Search Store:**
```
You: /create my-knowledge-base
```

2. **Add Files to the `files/` Directory:**
Place your documents (PDF, TXT, JSON, etc.) in the `files/` directory.

3. **Upload Files to the Store:**
```
You: /upload
```

4. **Start a Chat Session:**
```
You: /start
```

5. **Ask Questions:**
```
You: What information is available in the documents?
```

The assistant will respond with answers grounded in your uploaded documents and show citations.

6. **Export Your Conversation:**
```
You: /export my_research_session
```

## File Search Capabilities

### Supported File Types

File Search supports a wide range of file formats including:
- Text files (.txt, .md, .json, .yaml, etc.)
- Documents (.pdf, .docx, .html)
- Code files (.py, .js, .java, .cpp, etc.)
- And many more (see Gemini API documentation)

### How It Works

1. **File Upload:** Files are automatically chunked and embedded using Gemini's embedding model
2. **Semantic Search:** When you ask a question, the system searches for relevant chunks
3. **Grounded Responses:** The model uses retrieved information to provide accurate answers
4. **Citations:** Responses include metadata showing which documents were used

## Configuration

Edit `src/config.py` to customize:

- **Model:** Default is `gemini-2.5-flash`
- **System Instruction:** Customize the AI's behavior
- **Thinking Budget:** Adjust dynamic thinking settings
- **Files Directory:** Change the default files location

## Features in Detail

### Dynamic Thinking

The application uses Gemini 2.5 Flash with dynamic thinking enabled by default. This allows the model to spend more time reasoning about complex queries.

### System Instructions

A default system instruction guides the model to:
- Use file search to provide accurate answers
- Cite sources from uploaded documents
- Be helpful and informative

You can customize this in `src/config.py`.

### Citations Display

When the model uses information from your documents, citations are automatically displayed showing:
- Which documents were referenced
- Search queries used
- Number of grounded segments in the response

### Chat Export

Export your conversation history to a markdown file for documentation, sharing, or archival purposes:

```
You: /export my_conversation
```

This will create a file `exports/my_conversation.md` containing:
- Full conversation with formatted messages
- All citations and source documents
- Metadata (timestamp, model, file search store used)

If you don't specify a filename, it will auto-generate one with a timestamp (e.g., `chat_export_20251107_143022.md`).

## API Costs

- **Embeddings:** $0.15 per 1M tokens (charged at indexing time)
- **Storage:** Free
- **Generation:** Standard Gemini API pricing

For detailed pricing, visit: [https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Rate Limits

- **Maximum file size:** 100 MB per document
- **File search stores per project:** 10
- **Total store size:** Varies by tier (Free: 1 GB, Tier 1: 10 GB, etc.)

## Troubleshooting

### API Key Issues

If you see "GEMINI_API_KEY not found" error:
1. Make sure `.env` file exists in the project root
2. Verify the API key is correctly set in `.env`
3. Don't use quotes around the API key value

### Import Errors

If you encounter import errors:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

### File Upload Issues

- Ensure files are in the `files/` directory
- Check file size is under 100 MB
- Verify file format is supported

## Best Practices

1. **Store Organization:** Create separate stores for different knowledge domains
2. **File Naming:** Use descriptive names for files (visible in citations)
3. **Chunking:** Let Google handle automatic chunking for best results
4. **Store Size:** Keep individual stores under 20 GB for optimal performance

## Development

### Running in Development Mode

```bash
source venv/bin/activate
python main.py
```

### Adding New Features

The modular design makes it easy to extend:
- `src/config.py` - Add configuration options
- `src/gemini_client.py` - Extend Gemini API functionality
- `src/file_search_manager.py` - Add file management features
- `src/chat_interface.py` - Add new commands or UI features

## Documentation References

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [File Search Documentation](https://ai.google.dev/gemini-api/docs/file-search)
- [google-genai Python SDK](https://github.com/googleapis/python-genai)

## License

This application is provided as-is for educational and development purposes.

## Support

For issues with the Gemini API, refer to the official documentation:
- [https://ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs)

---

Built with Google Gemini API and google-genai Python library (v1.49.0)
