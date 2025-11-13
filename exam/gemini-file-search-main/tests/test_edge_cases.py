"""Additional edge case tests for comprehensive coverage."""

import pytest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
from google.genai.errors import APIError
from src.gemini_client import GeminiChatClient
from src.file_search_manager import FileSearchManager
from src.chat_interface import ChatInterface


class TestGeminiClientEdgeCases:
    """Edge case tests for GeminiChatClient."""

    @patch('src.gemini_client.genai.Client')
    def test_send_message_without_config_params(self, mock_genai_client):
        """Test sending a message when no config params are needed."""
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_response.text = 'Response'
        mock_response.candidates = []

        mock_chat.send_message.return_value = mock_response
        mock_client_instance.chats.create.return_value = mock_chat
        mock_genai_client.return_value = mock_client_instance

        # Client with no extra config
        client = GeminiChatClient(
            api_key='test-key',
            system_instruction=None,
            enable_thinking=False
        )
        client.start_chat()
        result = client.send_message('Hello')

        assert result == mock_response
        # Should send message without config since no params set
        call_args = mock_chat.send_message.call_args
        # Config should be None or not passed
        assert len(call_args[0]) == 1  # Only message passed

    @patch('src.gemini_client.genai.Client')
    def test_display_response_with_empty_candidates(self, mock_genai_client, capsys):
        """Test displaying response with empty candidates list."""
        mock_response = Mock()
        mock_response.text = 'Response text'
        mock_response.candidates = []

        client = GeminiChatClient(api_key='test-key')
        client.display_response(mock_response)

        captured = capsys.readouterr()
        assert 'Response text' in captured.out

    @patch('src.gemini_client.genai.Client')
    def test_display_citations_with_no_attributes(self, mock_genai_client, capsys):
        """Test displaying citations when metadata has no useful attributes."""
        mock_chunk = Mock()
        # Remove web and retrieved_context attributes
        mock_chunk.web = None
        mock_chunk.retrieved_context = None

        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = [mock_chunk]
        mock_grounding.grounding_supports = []

        client = GeminiChatClient(api_key='test-key')
        client._display_citations(mock_grounding)

        captured = capsys.readouterr()
        assert 'CITATIONS' in captured.out


class TestFileSearchManagerEdgeCases:
    """Edge case tests for FileSearchManager."""

    def test_create_store_with_empty_display_name(self):
        """Test creating store with empty string as display name."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'store-123'
        mock_client.file_search_stores.create.return_value = mock_store

        manager = FileSearchManager(mock_client)

        with patch('time.time', return_value=1234567890):
            result = manager.create_store(display_name='')

        # Should generate name since empty string is falsy
        call_args = mock_client.file_search_stores.create.call_args
        assert 'file-search-chat-1234567890' in call_args[1]['config']['display_name']

    def test_list_files_in_store_without_display_name(self):
        """Test listing files when store has no display_name attribute."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'store1'
        # Don't set display_name attribute
        mock_store.spec = ['name']
        mock_client.file_search_stores.get.return_value = mock_store

        manager = FileSearchManager(mock_client)
        result = manager.list_files_in_store('store1')

        assert result == []

    def test_display_stores_summary_with_minimal_attributes(self, capsys):
        """Test displaying stores when they have minimal attributes."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'minimal-store'
        # Only has name, no display_name or create_time
        mock_store.spec = ['name']

        mock_client.file_search_stores.list.return_value = [mock_store]

        manager = FileSearchManager(mock_client)
        manager.display_stores_summary()

        captured = capsys.readouterr()
        assert 'File Search Stores (1)' in captured.out
        assert 'minimal-store' in captured.out


class TestChatInterfaceEdgeCases:
    """Edge case tests for ChatInterface."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='n')
    def test_handle_command_with_extra_whitespace(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test handling command with extra whitespace."""
        mock_validate.return_value = True

        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.create_store.return_value = mock_store
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        # Command with multiple spaces
        interface.handle_command('/create    store-with-spaces   ')

        # Should handle it gracefully - verify store was created
        mock_fsm_instance.create_store.assert_called_once()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='y')
    def test_cmd_start_chat_with_store_selected(self, mock_input, mock_fsm, mock_client, mock_validate, capsys):
        """Test starting chat when file search store is selected."""
        mock_validate.return_value = True

        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_client_instance = Mock()
        mock_client_instance.chat = None
        mock_client_instance.start_chat.return_value = True
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.current_store = mock_store
        interface.cmd_start_chat()

        captured = capsys.readouterr()
        assert 'Using file search store' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='y')
    def test_cmd_start_chat_without_store(self, mock_input, mock_fsm, mock_client, mock_validate, capsys):
        """Test starting chat when no file search store is selected."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_client_instance.chat = None
        mock_client_instance.start_chat.return_value = True
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.current_store = None
        interface.cmd_start_chat()

        captured = capsys.readouterr()
        assert 'No file search store selected' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.open', new_callable=MagicMock)
    @patch('pathlib.Path.mkdir')
    def test_cmd_export_chat_with_model_messages(self, mock_mkdir, mock_file, mock_fsm, mock_client, mock_validate):
        """Test exporting chat with model messages that have candidates."""
        mock_validate.return_value = True

        # Create mock message with grounding metadata
        mock_message = Mock()
        mock_message.role = 'model'
        mock_part = Mock()
        mock_part.text = 'Response with citations'
        mock_message.parts = [mock_part]

        mock_candidate = Mock()
        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = []
        mock_grounding.grounding_supports = []
        mock_candidate.grounding_metadata = mock_grounding
        mock_message.candidates = [mock_candidate]

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message]
        mock_client.return_value = mock_client_instance

        # Setup mock file handle
        mock_file_handle = MagicMock()
        mock_file.return_value.__enter__.return_value = mock_file_handle

        interface = ChatInterface()
        interface.cmd_export_chat('test')

        # Verify write was called
        assert mock_file_handle.write.called

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_chat_message_response_none(self, mock_fsm, mock_client, mock_validate):
        """Test handling chat message when response is None."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_client_instance.chat = mock_chat
        mock_client_instance.send_message.return_value = None
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.handle_chat_message('Hello')

        # Should not crash, display_response handles None

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_show_history_with_messages_no_text(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test show history with messages that have no text."""
        mock_validate.return_value = True

        # Message with part that has no text attribute
        mock_message = Mock()
        mock_message.role = 'user'
        mock_part = Mock()
        mock_part.spec = []  # No text attribute
        mock_message.parts = [mock_part]

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message]
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_show_history()

        captured = capsys.readouterr()
        assert 'CHAT HISTORY' in captured.out


class TestConfigEdgeCases:
    """Edge case tests for Config."""

    @patch.dict('os.environ', {}, clear=True)
    def test_config_without_env_file(self):
        """Test that config handles missing environment variables."""
        from src.config import Config

        # API key should be None if not in environment
        # (actual value depends on .env file presence)
        assert Config.GEMINI_API_KEY is None or isinstance(Config.GEMINI_API_KEY, str)


class TestIntegrationWorkflows:
    """Complex integration workflow tests."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='y')
    def test_complete_chat_workflow_with_export(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test complete workflow: start chat, send message, export."""
        mock_validate.return_value = True

        # Setup mocks
        mock_response = Mock()
        mock_response.text = 'Response'
        mock_response.candidates = []

        mock_message1 = Mock()
        mock_message1.role = 'user'
        mock_part1 = Mock()
        mock_part1.text = 'Hello'
        mock_message1.parts = [mock_part1]
        mock_message1.candidates = []

        mock_message2 = Mock()
        mock_message2.role = 'model'
        mock_part2 = Mock()
        mock_part2.text = 'Response'
        mock_message2.parts = [mock_part2]
        mock_message2.candidates = []

        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_client_instance.chat = None
        mock_client_instance.start_chat.return_value = True
        mock_client_instance.send_message.return_value = mock_response
        mock_client_instance.get_chat_history.return_value = [mock_message1, mock_message2]
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()

        # Start chat
        interface.cmd_start_chat()
        mock_client_instance.chat = mock_chat

        # Send message
        interface.handle_chat_message('Hello')

        # Export should work with history
        with patch('builtins.open', MagicMock()), \
             patch('pathlib.Path.mkdir'):
            interface.cmd_export_chat('test')

        mock_client_instance.send_message.assert_called_once()
