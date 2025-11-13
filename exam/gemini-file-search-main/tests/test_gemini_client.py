"""Tests for the GeminiChatClient module."""

import pytest
from unittest.mock import Mock, MagicMock, patch, call
from google.genai import types
from google.genai.errors import APIError
from src.gemini_client import GeminiChatClient


class TestGeminiChatClientInit:
    """Test cases for GeminiChatClient initialization."""

    @patch('src.gemini_client.genai.Client')
    def test_init_with_minimal_params(self, mock_genai_client):
        """Test initialization with minimal parameters."""
        client = GeminiChatClient(api_key='test-key')

        assert client.model_name == 'gemini-2.5-flash'
        assert client.system_instruction is None
        assert client.enable_thinking is True
        assert client.thinking_budget is None
        assert client.chat is None
        assert client.file_search_store_names == []
        mock_genai_client.assert_called_once_with(api_key='test-key')

    @patch('src.gemini_client.genai.Client')
    def test_init_with_all_params(self, mock_genai_client):
        """Test initialization with all parameters."""
        client = GeminiChatClient(
            api_key='test-key',
            model_name='gemini-2.5-pro',
            system_instruction='Test instruction',
            enable_thinking=False,
            thinking_budget=128
        )

        assert client.model_name == 'gemini-2.5-pro'
        assert client.system_instruction == 'Test instruction'
        assert client.enable_thinking is False
        assert client.thinking_budget == 128

    @patch('src.gemini_client.genai.Client')
    def test_init_creates_genai_client(self, mock_genai_client):
        """Test that initialization creates a genai.Client."""
        mock_instance = Mock()
        mock_genai_client.return_value = mock_instance

        client = GeminiChatClient(api_key='test-key')

        assert client.client == mock_instance
        mock_genai_client.assert_called_once_with(api_key='test-key')


class TestSetFileSearchStores:
    """Test cases for set_file_search_stores method."""

    @patch('src.gemini_client.genai.Client')
    def test_set_file_search_stores_single(self, mock_genai_client):
        """Test setting a single file search store."""
        client = GeminiChatClient(api_key='test-key')
        store_names = ['store1']

        client.set_file_search_stores(store_names)

        assert client.file_search_store_names == store_names

    @patch('src.gemini_client.genai.Client')
    def test_set_file_search_stores_multiple(self, mock_genai_client):
        """Test setting multiple file search stores."""
        client = GeminiChatClient(api_key='test-key')
        store_names = ['store1', 'store2', 'store3']

        client.set_file_search_stores(store_names)

        assert client.file_search_store_names == store_names

    @patch('src.gemini_client.genai.Client')
    def test_set_file_search_stores_empty(self, mock_genai_client):
        """Test setting empty file search stores list."""
        client = GeminiChatClient(api_key='test-key')
        client.file_search_store_names = ['existing_store']

        client.set_file_search_stores([])

        assert client.file_search_store_names == []


class TestStartChat:
    """Test cases for start_chat method."""

    @patch('src.gemini_client.genai.Client')
    def test_start_chat_success(self, mock_genai_client):
        """Test starting a chat successfully."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        result = client.start_chat()

        assert result is True
        assert client.chat == mock_chat
        mock_client_instance.chats.create.assert_called_once_with(
            model='gemini-2.5-flash'
        )

    @patch('src.gemini_client.genai.Client')
    def test_start_chat_with_custom_model(self, mock_genai_client):
        """Test starting a chat with custom model."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(
            api_key='test-key',
            model_name='gemini-2.5-pro'
        )
        result = client.start_chat()

        assert result is True
        mock_client_instance.chats.create.assert_called_once_with(
            model='gemini-2.5-pro'
        )

    @patch('src.gemini_client.genai.Client')
    def test_start_chat_api_error(self, mock_genai_client):
        """Test starting a chat when API returns an error."""
        mock_client_instance = Mock()
        mock_client_instance.chats.create.side_effect = APIError(500, {'error': {'message': 'Chat Creation Failed'}})
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        result = client.start_chat()

        assert result is False
        assert client.chat is None


class TestSendMessage:
    """Test cases for send_message method."""

    @patch('src.gemini_client.genai.Client')
    def test_send_message_without_chat(self, mock_genai_client):
        """Test sending a message without starting chat."""
        client = GeminiChatClient(api_key='test-key')
        result = client.send_message('Hello')

        assert result is None

    @patch('src.gemini_client.genai.Client')
    def test_send_message_simple(self, mock_genai_client):
        """Test sending a simple message."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_chat.send_message.return_value = mock_response
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()
        result = client.send_message('Hello')

        assert result == mock_response
        mock_chat.send_message.assert_called_once()

    @patch('src.gemini_client.genai.Client')
    def test_send_message_with_system_instruction(self, mock_genai_client):
        """Test sending a message with system instruction."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_chat.send_message.return_value = mock_response
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(
            api_key='test-key',
            system_instruction='You are helpful'
        )
        client.start_chat()
        result = client.send_message('Hello')

        assert result == mock_response
        # Check that config was passed
        call_args = mock_chat.send_message.call_args
        assert 'config' in call_args[1]

    @patch('src.gemini_client.genai.Client')
    def test_send_message_with_thinking_config(self, mock_genai_client):
        """Test sending a message with thinking configuration."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_chat.send_message.return_value = mock_response
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(
            api_key='test-key',
            enable_thinking=True,
            thinking_budget=128
        )
        client.start_chat()
        result = client.send_message('Hello')

        assert result == mock_response
        call_args = mock_chat.send_message.call_args
        assert 'config' in call_args[1]

    @patch('src.gemini_client.genai.Client')
    def test_send_message_with_file_search(self, mock_genai_client):
        """Test sending a message with file search enabled."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_chat.send_message.return_value = mock_response
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()
        client.set_file_search_stores(['store1', 'store2'])
        result = client.send_message('Search question')

        assert result == mock_response
        call_args = mock_chat.send_message.call_args
        assert 'config' in call_args[1]

    @patch('src.gemini_client.genai.Client')
    def test_send_message_api_error(self, mock_genai_client):
        """Test sending a message when API returns an error."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_chat.send_message.side_effect = APIError(500, {'error': {'message': 'Message Failed'}})
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()
        result = client.send_message('Hello')

        assert result is None

    @patch('src.gemini_client.genai.Client')
    def test_send_message_with_all_features(self, mock_genai_client):
        """Test sending a message with all features enabled."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_chat.send_message.return_value = mock_response
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(
            api_key='test-key',
            system_instruction='You are helpful',
            enable_thinking=True,
            thinking_budget=256
        )
        client.start_chat()
        client.set_file_search_stores(['store1'])
        result = client.send_message('Complex query')

        assert result == mock_response
        mock_chat.send_message.assert_called_once()


class TestGetChatHistory:
    """Test cases for get_chat_history method."""

    @patch('src.gemini_client.genai.Client')
    def test_get_chat_history_without_chat(self, mock_genai_client):
        """Test getting chat history without starting chat."""
        client = GeminiChatClient(api_key='test-key')
        result = client.get_chat_history()

        assert result == []

    @patch('src.gemini_client.genai.Client')
    def test_get_chat_history_success(self, mock_genai_client):
        """Test getting chat history successfully."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_message1 = Mock()
        mock_message2 = Mock()
        mock_chat.get_history.return_value = [mock_message1, mock_message2]
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()
        result = client.get_chat_history()

        assert len(result) == 2
        assert result[0] == mock_message1
        assert result[1] == mock_message2

    @patch('src.gemini_client.genai.Client')
    def test_get_chat_history_empty(self, mock_genai_client):
        """Test getting empty chat history."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_chat.get_history.return_value = []
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()
        result = client.get_chat_history()

        assert result == []

    @patch('src.gemini_client.genai.Client')
    def test_get_chat_history_api_error(self, mock_genai_client):
        """Test getting chat history when API returns an error."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_chat.get_history.side_effect = APIError(500, {'error': {'message': 'History Failed'}})
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()
        result = client.get_chat_history()

        assert result == []


class TestDisplayResponse:
    """Test cases for display_response method."""

    @patch('src.gemini_client.genai.Client')
    def test_display_response_none(self, mock_genai_client, capsys):
        """Test displaying None response."""
        client = GeminiChatClient(api_key='test-key')
        client.display_response(None)

        captured = capsys.readouterr()
        assert captured.out == ''

    @patch('src.gemini_client.genai.Client')
    def test_display_response_simple_text(self, mock_genai_client, capsys):
        """Test displaying a simple text response."""
        mock_response = Mock()
        mock_response.text = 'Hello, how can I help?'
        mock_response.candidates = []

        client = GeminiChatClient(api_key='test-key')
        client.display_response(mock_response)

        captured = capsys.readouterr()
        assert 'Hello, how can I help?' in captured.out

    @patch('src.gemini_client.genai.Client')
    def test_display_response_with_grounding(self, mock_genai_client, capsys):
        """Test displaying a response with grounding metadata."""
        mock_response = Mock()
        mock_response.text = 'Response with citations'

        mock_grounding = Mock()
        mock_grounding.grounding_chunks = []
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_supports = []

        mock_candidate = Mock()
        mock_candidate.grounding_metadata = mock_grounding
        mock_response.candidates = [mock_candidate]

        client = GeminiChatClient(api_key='test-key')
        client.display_response(mock_response)

        captured = capsys.readouterr()
        assert 'Response with citations' in captured.out
        assert 'CITATIONS' in captured.out


class TestDisplayCitations:
    """Test cases for _display_citations method."""

    @patch('src.gemini_client.genai.Client')
    def test_display_citations_with_search_queries(self, mock_genai_client, capsys):
        """Test displaying citations with search queries."""
        mock_grounding = Mock()
        mock_search_entry = Mock()
        mock_search_entry.rendered_content = 'query1, query2'
        mock_grounding.search_entry_point = mock_search_entry
        mock_grounding.grounding_chunks = []
        mock_grounding.grounding_supports = []

        client = GeminiChatClient(api_key='test-key')
        client._display_citations(mock_grounding)

        captured = capsys.readouterr()
        assert 'CITATIONS' in captured.out
        assert 'query1, query2' in captured.out

    @patch('src.gemini_client.genai.Client')
    def test_display_citations_with_web_chunks(self, mock_genai_client, capsys):
        """Test displaying citations with web chunks."""
        mock_chunk = Mock()
        mock_web = Mock()
        mock_web.title = 'Example Website'
        mock_web.uri = 'https://example.com'
        mock_chunk.web = mock_web
        mock_chunk.retrieved_context = None

        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = [mock_chunk]
        mock_grounding.grounding_supports = []

        client = GeminiChatClient(api_key='test-key')
        client._display_citations(mock_grounding)

        captured = capsys.readouterr()
        assert 'Example Website' in captured.out
        assert 'https://example.com' in captured.out

    @patch('src.gemini_client.genai.Client')
    def test_display_citations_with_file_search_chunks(self, mock_genai_client, capsys):
        """Test displaying citations with file search chunks."""
        mock_chunk = Mock()
        mock_chunk.web = None
        mock_retrieved = Mock()
        mock_retrieved.uri = 'document.pdf'
        mock_retrieved.title = 'Important Document'
        mock_chunk.retrieved_context = mock_retrieved

        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = [mock_chunk]
        mock_grounding.grounding_supports = []

        client = GeminiChatClient(api_key='test-key')
        client._display_citations(mock_grounding)

        captured = capsys.readouterr()
        assert 'document.pdf' in captured.out
        assert 'Important Document' in captured.out

    @patch('src.gemini_client.genai.Client')
    def test_display_citations_with_grounding_supports(self, mock_genai_client, capsys):
        """Test displaying citations with grounding supports."""
        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = []
        mock_grounding.grounding_supports = [Mock(), Mock(), Mock()]

        client = GeminiChatClient(api_key='test-key')
        client._display_citations(mock_grounding)

        captured = capsys.readouterr()
        assert 'Grounding supports: 3' in captured.out


class TestResetChat:
    """Test cases for reset_chat method."""

    @patch('src.gemini_client.genai.Client')
    def test_reset_chat(self, mock_genai_client, capsys):
        """Test resetting a chat session."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        client = GeminiChatClient(api_key='test-key')
        client.start_chat()

        assert client.chat is not None

        client.reset_chat()

        assert client.chat is None
        captured = capsys.readouterr()
        assert 'Chat session reset' in captured.out

    @patch('src.gemini_client.genai.Client')
    def test_reset_chat_when_no_active_chat(self, mock_genai_client):
        """Test resetting when there's no active chat."""
        client = GeminiChatClient(api_key='test-key')
        assert client.chat is None

        client.reset_chat()

        assert client.chat is None


class TestGeminiChatClientIntegration:
    """Integration tests for GeminiChatClient."""

    @patch('src.gemini_client.genai.Client')
    def test_full_chat_flow(self, mock_genai_client):
        """Test complete chat flow from start to finish."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_response.text = 'Response text'
        mock_response.candidates = []

        mock_chat.send_message.return_value = mock_response
        mock_chat.get_history.return_value = []
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        # Initialize client
        client = GeminiChatClient(
            api_key='test-key',
            system_instruction='Be helpful'
        )

        # Start chat
        assert client.start_chat() is True
        assert client.chat is not None

        # Send message
        response = client.send_message('Hello')
        assert response == mock_response

        # Get history
        history = client.get_chat_history()
        assert isinstance(history, list)

        # Reset chat
        client.reset_chat()
        assert client.chat is None
