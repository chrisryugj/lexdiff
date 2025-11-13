"""Gemini Client wrapper for chat functionality with File Search."""

from typing import List, Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError


class GeminiChatClient:
    """Wrapper for Gemini API chat functionality with File Search support."""

    def __init__(
        self,
        api_key: str,
        model_name: str = 'gemini-2.5-flash',
        system_instruction: Optional[str] = None,
        enable_thinking: bool = True,
        thinking_budget: Optional[int] = None
    ):
        """Initialize the Gemini Chat Client.

        Args:
            api_key: Gemini API key
            model_name: Name of the Gemini model to use
            system_instruction: System instruction to guide model behavior
            enable_thinking: Whether to enable dynamic thinking
            thinking_budget: Thinking budget (None for default, 0 to disable)
        """
        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name
        self.system_instruction = system_instruction
        self.enable_thinking = enable_thinking
        self.thinking_budget = thinking_budget
        self.chat = None
        self.file_search_store_names = []

    def set_file_search_stores(self, store_names: List[str]):
        """Set the file search stores to use for queries.

        Args:
            store_names: List of file search store names
        """
        self.file_search_store_names = store_names

    def start_chat(self):
        """Start a new chat session."""
        try:
            # Create chat with model configuration
            self.chat = self.client.chats.create(model=self.model_name)
            print(f"\nChat session started with model: {self.model_name}")
            if self.system_instruction:
                print("System instruction applied.")
            if self.enable_thinking:
                print("Dynamic thinking enabled.")
            return True
        except APIError as e:
            print(f"Error starting chat: {e}")
            return False

    def send_message(self, message: str) -> Optional[any]:
        """Send a message in the chat session with File Search.

        Args:
            message: User message

        Returns:
            Response object or None if error
        """
        if not self.chat:
            print("Error: Chat session not started. Call start_chat() first.")
            return None

        try:
            # Build the configuration
            config_params = {}

            # Add system instruction
            if self.system_instruction:
                config_params['system_instruction'] = self.system_instruction

            # Add thinking configuration
            if self.enable_thinking and self.thinking_budget is not None:
                config_params['thinking_config'] = types.ThinkingConfig(
                    thinking_budget=self.thinking_budget
                )

            # Add File Search tool if stores are configured
            if self.file_search_store_names:
                config_params['tools'] = [
                    types.Tool(
                        file_search=types.FileSearch(
                            file_search_store_names=self.file_search_store_names
                        )
                    )
                ]

            # Create config object if we have any parameters
            config = types.GenerateContentConfig(
                **config_params) if config_params else None

            # Send message
            if config:
                response = self.chat.send_message(message, config=config)
            else:
                response = self.chat.send_message(message)

            return response

        except APIError as e:
            print(f"\nError sending message: {e}")
            return None

    def get_chat_history(self) -> List[any]:
        """Get the chat history.

        Returns:
            List of messages in the chat history
        """
        if not self.chat:
            return []

        try:
            return list(self.chat.get_history())
        except APIError as e:
            print(f"Error getting chat history: {e}")
            return []

    def display_response(self, response: any):
        """Display the response with text and citations.

        Args:
            response: Response object from the model
        """
        if not response:
            return

        # Display the main text response
        print(f"\nAssistant: {response.text}")

        # Display grounding metadata (citations) if available
        if response.candidates and len(response.candidates) > 0:
            candidate = response.candidates[0]

            if hasattr(candidate, 'grounding_metadata') and candidate.grounding_metadata:
                self._display_citations(candidate.grounding_metadata)

    def _display_citations(self, grounding_metadata: any):
        """Display citation information from grounding metadata.

        Args:
            grounding_metadata: Grounding metadata from the response
        """
        print("\n" + "="*70)
        print("CITATIONS")
        print("="*70)

        # Display search queries if available
        if hasattr(grounding_metadata, 'search_entry_point') and grounding_metadata.search_entry_point:
            print("\nSearch queries used:")
            if hasattr(grounding_metadata.search_entry_point, 'rendered_content'):
                print(
                    f"  {grounding_metadata.search_entry_point.rendered_content}")

        # Display grounding chunks (sources)
        if hasattr(grounding_metadata, 'grounding_chunks') and grounding_metadata.grounding_chunks:
            print(f"\nSources ({len(grounding_metadata.grounding_chunks)}):")

            for i, chunk in enumerate(grounding_metadata.grounding_chunks, 1):
                print(f"\n{i}. ", end="")

                # Try to extract relevant information from the chunk
                if hasattr(chunk, 'web') and chunk.web:
                    print(
                        f"Web: {chunk.web.title if hasattr(chunk.web, 'title') else 'N/A'}")
                    if hasattr(chunk.web, 'uri'):
                        print(f"   URI: {chunk.web.uri}")
                elif hasattr(chunk, 'retrieved_context') and chunk.retrieved_context:
                    # For file search results
                    if hasattr(chunk.retrieved_context, 'uri'):
                        print(f"Document: {chunk.retrieved_context.uri}")
                    if hasattr(chunk.retrieved_context, 'title'):
                        print(f"   Title: {chunk.retrieved_context.title}")
                else:
                    # Fallback: display available attributes
                    print(f"Chunk: {chunk}")

        # Display grounding supports (which parts of the answer are grounded)
        if hasattr(grounding_metadata, 'grounding_supports') and grounding_metadata.grounding_supports:
            print(
                f"\nGrounding supports: {len(grounding_metadata.grounding_supports)} segment(s) grounded")

        print("="*70)

    def reset_chat(self):
        """Reset the chat session."""
        self.chat = None
        print("\nChat session reset.")
