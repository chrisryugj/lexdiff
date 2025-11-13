"""Interactive chat interface for the Gemini File Search application."""

from pathlib import Path
from datetime import datetime

from src.config import Config
from src.gemini_client import GeminiChatClient
from src.file_search_manager import FileSearchManager


class ChatInterface:
    """Interactive chat interface with file search store management."""

    def __init__(self):
        """Initialize the chat interface."""
        # Validate configuration
        Config.validate()

        # Initialize Gemini client
        self.gemini_client = GeminiChatClient(
            api_key=Config.GEMINI_API_KEY,
            model_name=Config.MODEL_NAME,
            system_instruction=Config.SYSTEM_INSTRUCTION,
            enable_thinking=Config.ENABLE_THINKING,
            thinking_budget=Config.THINKING_BUDGET
        )

        # Initialize file search manager
        self.file_search_manager = FileSearchManager(
            client=self.gemini_client.client,
            store_prefix=Config.FILE_SEARCH_STORE_PREFIX
        )

        self.current_store = None
        self.is_running = False

    def start(self):
        """Start the chat interface."""
        self.is_running = True
        self.display_welcome()
        self.main_menu()

    def display_welcome(self):
        """Display welcome message."""
        print("\n" + "="*70)
        print("  GEMINI FILE SEARCH CHAT APPLICATION")
        print("="*70)
        print(f"\nModel: {Config.MODEL_NAME}")
        print(f"Files Directory: {Config.FILES_DIR}")
        print("\nType '/help' for available commands")
        print("Type '/quit' to exit")
        print("="*70)

    def main_menu(self):
        """Main interaction loop."""
        while self.is_running:
            try:
                user_input = input("\nYou: ").strip()

                if not user_input:
                    continue

                # Handle commands
                if user_input.startswith('/'):
                    self.handle_command(user_input)
                else:
                    # Regular chat message
                    self.handle_chat_message(user_input)

            except KeyboardInterrupt:
                print("\n\nInterrupted by user.")
                self.is_running = False
            except Exception as e:
                print(f"\nError: {e}")

        print("\nGoodbye!")

    def handle_command(self, command: str):
        """Handle user commands.

        Args:
            command: Command string starting with '/'
        """
        parts = command.split(maxsplit=1)
        cmd = parts[0].lower()
        args = parts[1] if len(parts) > 1 else ""

        if cmd == '/help':
            self.show_help()
        elif cmd == '/quit' or cmd == '/exit':
            self.is_running = False
        elif cmd == '/create' or cmd == '/create-store':
            self.cmd_create_store(args)
        elif cmd == '/list' or cmd == '/list-stores':
            self.cmd_list_stores()
        elif cmd == '/select' or cmd == '/select-store':
            self.cmd_select_store(args)
        elif cmd == '/delete' or cmd == '/delete-store':
            self.cmd_delete_store(args)
        elif cmd == '/upload' or cmd == '/upload-files':
            self.cmd_upload_files()
        elif cmd == '/store' or cmd == '/store-info':
            self.cmd_store_info()
        elif cmd == '/start' or cmd == '/start-chat':
            self.cmd_start_chat()
        elif cmd == '/reset' or cmd == '/reset-chat':
            self.cmd_reset_chat()
        elif cmd == '/history':
            self.cmd_show_history()
        elif cmd == '/export' or cmd == '/export-chat':
            self.cmd_export_chat(args)
        else:
            print(f"Unknown command: {cmd}")
            print("Type '/help' for available commands")

    def handle_chat_message(self, message: str):
        """Handle regular chat messages.

        Args:
            message: User message
        """
        if not self.gemini_client.chat:
            print("\nPlease start a chat session first using '/start'")
            return

        if not self.current_store:
            print(
                "\nWarning: No file search store selected. Using chat without file search.")
            print("Use '/select <store-name>' to enable file search.")

        # Send message and display response
        response = self.gemini_client.send_message(message)
        if response:
            self.gemini_client.display_response(response)

    def show_help(self):
        """Display help information."""
        print("\n" + "="*70)
        print("AVAILABLE COMMANDS")
        print("="*70)
        print("\nFile Search Store Management:")
        print("  /create [name]           - Create a new file search store")
        print("  /list                    - List all file search stores")
        print("  /select <name>           - Select a store for chat queries")
        print("  /delete <name>           - Delete a file search store")
        print("  /upload                  - Upload files from 'files' directory")
        print("  /store                   - Show current store information")
        print("\nChat Commands:")
        print("  /start                   - Start a new chat session")
        print("  /reset                   - Reset the current chat session")
        print("  /history                 - Show chat history")
        print("  /export [filename]       - Export chat history as markdown")
        print("\nGeneral:")
        print("  /help                    - Show this help message")
        print("  /quit or /exit           - Exit the application")
        print(
            "\nNote: Commands support both short (/create) and long (/create-store) forms.")
        print("      To chat, simply type your message without a command prefix.")
        print("="*70)

    def cmd_create_store(self, display_name: str):
        """Create a new file search store.

        Args:
            display_name: Optional display name for the store
        """
        print("\nCreating file search store...")
        store = self.file_search_manager.create_store(
            display_name=display_name if display_name else None
        )

        if store:
            print(f"\nStore created successfully!")
            print(f"Store Name: {store.name}")

            # Ask if user wants to select this store
            choice = input(
                "\nSelect this store for chat? (y/n): ").strip().lower()
            if choice == 'y':
                self.current_store = store
                self.gemini_client.set_file_search_stores([store.name])
                print(f"Selected store: {store.name}")

    def cmd_list_stores(self):
        """List all file search stores."""
        self.file_search_manager.display_stores_summary()

    def cmd_select_store(self, store_name: str):
        """Select a file search store for chat.

        Args:
            store_name: Name of the store to select
        """
        if not store_name:
            print("\nError: Please provide a store name")
            print("Usage: /select <store-name>")
            return

        store = self.file_search_manager.get_store(store_name)
        if store:
            self.current_store = store
            self.gemini_client.set_file_search_stores([store.name])
            print(f"\nSelected store: {store.name}")
        else:
            print(f"\nStore not found: {store_name}")
            print("Use '/list' to see available stores")

    def cmd_delete_store(self, store_name: str):
        """Delete a file search store.

        Args:
            store_name: Name of the store to delete
        """
        if not store_name:
            print("\nError: Please provide a store name")
            print("Usage: /delete <store-name>")
            return

        # Confirm deletion
        print(f"\nAre you sure you want to delete '{store_name}'?")
        confirm = input("Type 'yes' to confirm: ").strip().lower()

        if confirm == 'yes':
            if self.file_search_manager.delete_store(store_name):
                # Deselect if this was the current store
                if self.current_store and self.current_store.name == store_name:
                    self.current_store = None
                    self.gemini_client.set_file_search_stores([])
                    print("Current store deselected.")
        else:
            print("Deletion cancelled.")

    def cmd_upload_files(self):
        """Upload files from the files directory to the current store."""
        if not self.current_store:
            print("\nError: No store selected. Please select a store first.")
            print("Use '/select <store-name>' or '/create'")
            return

        print(f"\nUploading files from: {Config.FILES_DIR}")
        print(f"To store: {self.current_store.name}")

        count = self.file_search_manager.upload_files_from_directory(
            Config.FILES_DIR,
            self.current_store.name
        )

        if count > 0:
            print(f"\nSuccessfully uploaded {count} file(s)!")
        else:
            print("\nNo files uploaded. Make sure files exist in the 'files' directory.")

    def cmd_store_info(self):
        """Show information about the current store."""
        if not self.current_store:
            print("\nNo store currently selected.")
            print("Use '/select <store-name>' to select a store")
            return

        print("\n" + "="*70)
        print("CURRENT STORE INFORMATION")
        print("="*70)
        print(f"\nStore Name: {self.current_store.name}")
        if hasattr(self.current_store, 'display_name'):
            print(f"Display Name: {self.current_store.display_name}")
        if hasattr(self.current_store, 'create_time'):
            print(f"Created: {self.current_store.create_time}")
        print("="*70)

    def cmd_start_chat(self):
        """Start a new chat session."""
        if self.gemini_client.chat:
            print("\nA chat session is already active.")
            choice = input(
                "Reset and start new session? (y/n): ").strip().lower()
            if choice != 'y':
                return

        if self.gemini_client.start_chat():
            if self.current_store:
                print(f"Using file search store: {self.current_store.name}")
            else:
                print(
                    "No file search store selected. Chat will work without file search.")
                print("Use '/select <store-name>' to enable file search.")

    def cmd_reset_chat(self):
        """Reset the chat session."""
        if not self.gemini_client.chat:
            print("\nNo active chat session to reset.")
            return

        self.gemini_client.reset_chat()

    def cmd_show_history(self):
        """Show chat history."""
        history = self.gemini_client.get_chat_history()

        if not history:
            print("\nNo chat history available.")
            return

        print("\n" + "="*70)
        print("CHAT HISTORY")
        print("="*70)

        for message in history:
            role = message.role.upper()
            if hasattr(message, 'parts') and message.parts:
                for part in message.parts:
                    if hasattr(part, 'text') and part.text:
                        print(f"\n{role}: {part.text}")

        print("="*70)

    def cmd_export_chat(self, filename: str):
        """Export chat history as markdown file.

        Args:
            filename: Optional custom filename (without .md extension)
        """
        history = self.gemini_client.get_chat_history()

        if not history:
            print("\nNo chat history available to export.")
            return

        # Generate filename with timestamp if not provided
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"chat_export_{timestamp}"

        # Ensure .md extension
        if not filename.endswith('.md'):
            filename += '.md'

        # Create exports directory if it doesn't exist
        exports_dir = Path('exports')
        exports_dir.mkdir(exist_ok=True)

        filepath = exports_dir / filename

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                # Write header
                f.write("# Gemini Chat Conversation Export\n\n")
                f.write(
                    f"**Exported:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                f.write(f"**Model:** {Config.MODEL_NAME}\n\n")

                if self.current_store:
                    f.write(
                        f"**File Search Store:** {self.current_store.name}\n\n")

                f.write("---\n\n")

                # Write conversation
                for message in history:
                    role = message.role.upper()

                    if hasattr(message, 'parts') and message.parts:
                        for part in message.parts:
                            if hasattr(part, 'text') and part.text:
                                # Format based on role
                                if role == 'USER':
                                    f.write(f"## You\n\n{part.text}\n\n")
                                elif role == 'MODEL':
                                    f.write(f"## Assistant\n\n{part.text}\n\n")

                                # Add grounding metadata if available
                                if role == 'MODEL' and hasattr(message, 'candidates'):
                                    for candidate in message.candidates:
                                        if hasattr(candidate, 'grounding_metadata') and candidate.grounding_metadata:
                                            f.write(self._format_citations_markdown(
                                                candidate.grounding_metadata))

                                f.write("---\n\n")

            print(f"\nChat exported successfully to: {filepath}")

        except Exception as e:
            print(f"\nError exporting chat: {e}")

    def _format_citations_markdown(self, grounding_metadata) -> str:
        """Format grounding metadata as markdown.

        Args:
            grounding_metadata: Grounding metadata from response

        Returns:
            Formatted markdown string
        """
        markdown = "### Citations\n\n"

        # Display search queries if available
        if hasattr(grounding_metadata, 'search_entry_point') and grounding_metadata.search_entry_point:
            if hasattr(grounding_metadata.search_entry_point, 'rendered_content'):
                markdown += f"**Search queries used:** {grounding_metadata.search_entry_point.rendered_content}\n\n"

        # Display grounding chunks (sources)
        if hasattr(grounding_metadata, 'grounding_chunks') and grounding_metadata.grounding_chunks:
            markdown += f"**Sources ({len(grounding_metadata.grounding_chunks)}):**\n\n"

            for i, chunk in enumerate(grounding_metadata.grounding_chunks, 1):
                markdown += f"{i}. "

                # Try to extract relevant information from the chunk
                if hasattr(chunk, 'web') and chunk.web:
                    title = chunk.web.title if hasattr(
                        chunk.web, 'title') else 'N/A'
                    markdown += f"**Web:** {title}\n"
                    if hasattr(chunk.web, 'uri'):
                        markdown += f"   - URI: {chunk.web.uri}\n"
                elif hasattr(chunk, 'retrieved_context') and chunk.retrieved_context:
                    # For file search results
                    if hasattr(chunk.retrieved_context, 'uri'):
                        markdown += f"**Document:** {chunk.retrieved_context.uri}\n"
                    if hasattr(chunk.retrieved_context, 'title'):
                        markdown += f"   - **Title:** {chunk.retrieved_context.title}\n"

                markdown += "\n"

        # Display grounding supports
        if hasattr(grounding_metadata, 'grounding_supports') and grounding_metadata.grounding_supports:
            markdown += f"**Grounding supports:** {len(grounding_metadata.grounding_supports)} segment(s) grounded\n\n"

        return markdown
