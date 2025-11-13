"""Tests for the ChatInterface module."""

import pytest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, mock_open
from datetime import datetime
from src.chat_interface import ChatInterface
from src.config import Config


class TestChatInterfaceInit:
    """Test cases for ChatInterface initialization."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_init_success(self, mock_fsm, mock_client, mock_validate):
        """Test successful initialization."""
        mock_validate.return_value = True

        interface = ChatInterface()

        assert interface.current_store is None
        assert interface.is_running is False
        mock_validate.assert_called_once()
        mock_client.assert_called_once()
        mock_fsm.assert_called_once()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_init_creates_gemini_client(self, mock_fsm, mock_client, mock_validate):
        """Test that initialization creates GeminiChatClient."""
        mock_validate.return_value = True

        interface = ChatInterface()

        mock_client.assert_called_once()
        call_kwargs = mock_client.call_args[1]
        assert 'api_key' in call_kwargs
        assert 'model_name' in call_kwargs
        assert 'system_instruction' in call_kwargs

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_init_creates_file_search_manager(self, mock_fsm, mock_client, mock_validate):
        """Test that initialization creates FileSearchManager."""
        mock_validate.return_value = True
        mock_client_instance = Mock()
        mock_client_instance.client = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()

        mock_fsm.assert_called_once()


class TestStartMethod:
    """Test cases for start method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch.object(ChatInterface, 'display_welcome')
    @patch.object(ChatInterface, 'main_menu')
    def test_start(self, mock_menu, mock_welcome, mock_fsm, mock_client, mock_validate):
        """Test start method."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.start()

        assert interface.is_running is True
        mock_welcome.assert_called_once()
        mock_menu.assert_called_once()


class TestDisplayWelcome:
    """Test cases for display_welcome method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_display_welcome(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test display welcome message."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.display_welcome()

        captured = capsys.readouterr()
        assert 'GEMINI FILE SEARCH CHAT APPLICATION' in captured.out
        assert 'Model:' in captured.out
        assert '/help' in captured.out


class TestHandleCommand:
    """Test cases for handle_command method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_help_command(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test handling /help command."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.handle_command('/help')

        captured = capsys.readouterr()
        assert 'AVAILABLE COMMANDS' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_quit_command(self, mock_fsm, mock_client, mock_validate):
        """Test handling /quit command."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.is_running = True
        interface.handle_command('/quit')

        assert interface.is_running is False

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_exit_command(self, mock_fsm, mock_client, mock_validate):
        """Test handling /exit command."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.is_running = True
        interface.handle_command('/exit')

        assert interface.is_running is False

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch.object(ChatInterface, 'cmd_create_store')
    def test_handle_create_command(self, mock_cmd, mock_fsm, mock_client, mock_validate):
        """Test handling /create command."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.handle_command('/create test-store')

        mock_cmd.assert_called_once_with('test-store')

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_unknown_command(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test handling unknown command."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.handle_command('/unknown')

        captured = capsys.readouterr()
        assert 'Unknown command' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch.object(ChatInterface, 'cmd_list_stores')
    def test_handle_list_stores_short_form(self, mock_cmd, mock_fsm, mock_client, mock_validate):
        """Test handling /list command (short form)."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.handle_command('/list')

        mock_cmd.assert_called_once()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch.object(ChatInterface, 'cmd_list_stores')
    def test_handle_list_stores_long_form(self, mock_cmd, mock_fsm, mock_client, mock_validate):
        """Test handling /list-stores command (long form)."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.handle_command('/list-stores')

        mock_cmd.assert_called_once()


class TestHandleChatMessage:
    """Test cases for handle_chat_message method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_chat_message_without_session(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test handling chat message without active session."""
        mock_validate.return_value = True
        mock_client_instance = Mock()
        mock_client_instance.chat = None
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.handle_chat_message('Hello')

        captured = capsys.readouterr()
        assert 'start a chat session first' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_chat_message_with_session(self, mock_fsm, mock_client, mock_validate):
        """Test handling chat message with active session."""
        mock_validate.return_value = True
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()
        mock_response.text = 'Response'
        mock_response.candidates = []

        mock_client_instance.chat = mock_chat
        mock_client_instance.send_message.return_value = mock_response
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.handle_chat_message('Hello')

        mock_client_instance.send_message.assert_called_once_with('Hello')
        mock_client_instance.display_response.assert_called_once_with(mock_response)

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_handle_chat_message_without_store(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test handling chat message without selected store."""
        mock_validate.return_value = True
        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_response = Mock()

        mock_client_instance.chat = mock_chat
        mock_client_instance.send_message.return_value = mock_response
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.current_store = None
        interface.handle_chat_message('Hello')

        captured = capsys.readouterr()
        assert 'No file search store selected' in captured.out


class TestCmdCreateStore:
    """Test cases for cmd_create_store method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='n')
    def test_cmd_create_store_with_name(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test creating a store with a name."""
        mock_validate.return_value = True
        mock_store = Mock()
        mock_store.name = 'test-store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.create_store.return_value = mock_store
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        interface.cmd_create_store('my-store')

        mock_fsm_instance.create_store.assert_called_once_with(display_name='my-store')

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='y')
    def test_cmd_create_store_and_select(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test creating a store and selecting it."""
        mock_validate.return_value = True
        mock_store = Mock()
        mock_store.name = 'test-store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.create_store.return_value = mock_store
        mock_fsm.return_value = mock_fsm_instance

        mock_client_instance = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_create_store('my-store')

        assert interface.current_store == mock_store
        mock_client_instance.set_file_search_stores.assert_called_once_with([mock_store.name])


class TestCmdSelectStore:
    """Test cases for cmd_select_store method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_select_store_success(self, mock_fsm, mock_client, mock_validate):
        """Test selecting a store successfully."""
        mock_validate.return_value = True
        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.get_store.return_value = mock_store
        mock_fsm.return_value = mock_fsm_instance

        mock_client_instance = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_select_store('store-123')

        assert interface.current_store == mock_store
        mock_client_instance.set_file_search_stores.assert_called_once_with([mock_store.name])

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_select_store_not_found(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test selecting a store that doesn't exist."""
        mock_validate.return_value = True

        mock_fsm_instance = Mock()
        mock_fsm_instance.get_store.return_value = None
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        interface.cmd_select_store('nonexistent')

        captured = capsys.readouterr()
        assert 'Store not found' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_select_store_no_name(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test selecting a store without providing a name."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.cmd_select_store('')

        captured = capsys.readouterr()
        assert 'provide a store name' in captured.out


class TestCmdDeleteStore:
    """Test cases for cmd_delete_store method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='yes')
    def test_cmd_delete_store_success(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test deleting a store successfully."""
        mock_validate.return_value = True

        mock_fsm_instance = Mock()
        mock_fsm_instance.delete_store.return_value = True
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        interface.cmd_delete_store('store-123')

        mock_fsm_instance.delete_store.assert_called_once_with('store-123')

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='no')
    def test_cmd_delete_store_cancelled(self, mock_input, mock_fsm, mock_client, mock_validate, capsys):
        """Test canceling store deletion."""
        mock_validate.return_value = True

        mock_fsm_instance = Mock()
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        interface.cmd_delete_store('store-123')

        captured = capsys.readouterr()
        assert 'cancelled' in captured.out
        mock_fsm_instance.delete_store.assert_not_called()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='yes')
    def test_cmd_delete_current_store(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test deleting the currently selected store."""
        mock_validate.return_value = True

        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.delete_store.return_value = True
        mock_fsm.return_value = mock_fsm_instance

        mock_client_instance = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.current_store = mock_store
        interface.cmd_delete_store('store-123')

        assert interface.current_store is None
        mock_client_instance.set_file_search_stores.assert_called_once_with([])


class TestCmdUploadFiles:
    """Test cases for cmd_upload_files method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_upload_files_success(self, mock_fsm, mock_client, mock_validate):
        """Test uploading files successfully."""
        mock_validate.return_value = True

        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.upload_files_from_directory.return_value = 3
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        interface.current_store = mock_store
        interface.cmd_upload_files()

        mock_fsm_instance.upload_files_from_directory.assert_called_once()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_upload_files_no_store(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test uploading files without selected store."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.current_store = None
        interface.cmd_upload_files()

        captured = capsys.readouterr()
        assert 'No store selected' in captured.out


class TestCmdStartChat:
    """Test cases for cmd_start_chat method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_start_chat_new(self, mock_fsm, mock_client, mock_validate):
        """Test starting a new chat session."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_client_instance.chat = None
        mock_client_instance.start_chat.return_value = True
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_start_chat()

        mock_client_instance.start_chat.assert_called_once()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='n')
    def test_cmd_start_chat_existing_cancelled(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test canceling restart of existing chat session."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_client_instance.chat = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_start_chat()

        mock_client_instance.start_chat.assert_not_called()


class TestCmdExportChat:
    """Test cases for cmd_export_chat method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_export_chat_no_history(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test exporting chat with no history."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = []
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_export_chat('')

        captured = capsys.readouterr()
        assert 'No chat history' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.open', new_callable=mock_open)
    @patch('pathlib.Path.mkdir')
    def test_cmd_export_chat_success(self, mock_mkdir, mock_file, mock_fsm, mock_client, mock_validate):
        """Test exporting chat successfully."""
        mock_validate.return_value = True

        # Create mock messages
        mock_message = Mock()
        mock_message.role = 'user'
        mock_part = Mock()
        mock_part.text = 'Test message'
        mock_message.parts = [mock_part]
        mock_message.candidates = []

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message]
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_export_chat('test_export')

        mock_file.assert_called_once()
        # Check that the file was opened for writing
        call_args = mock_file.call_args
        assert 'test_export.md' in str(call_args[0][0])

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.open', new_callable=mock_open)
    @patch('pathlib.Path.mkdir')
    def test_cmd_export_chat_auto_timestamp(self, mock_mkdir, mock_file, mock_fsm, mock_client, mock_validate):
        """Test exporting chat with auto-generated timestamp filename."""
        mock_validate.return_value = True

        mock_message = Mock()
        mock_message.role = 'user'
        mock_part = Mock()
        mock_part.text = 'Test'
        mock_message.parts = [mock_part]
        mock_message.candidates = []

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message]
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_export_chat('')

        mock_file.assert_called_once()
        call_args = mock_file.call_args
        assert 'chat_export_' in str(call_args[0][0])


class TestFormatCitationsMarkdown:
    """Test cases for _format_citations_markdown method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_format_citations_with_search_queries(self, mock_fsm, mock_client, mock_validate):
        """Test formatting citations with search queries."""
        mock_validate.return_value = True

        mock_grounding = Mock()
        mock_search = Mock()
        mock_search.rendered_content = 'query text'
        mock_grounding.search_entry_point = mock_search
        mock_grounding.grounding_chunks = []
        mock_grounding.grounding_supports = []

        interface = ChatInterface()
        result = interface._format_citations_markdown(mock_grounding)

        assert 'Citations' in result
        assert 'query text' in result

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_format_citations_with_web_chunks(self, mock_fsm, mock_client, mock_validate):
        """Test formatting citations with web chunks."""
        mock_validate.return_value = True

        mock_chunk = Mock()
        mock_web = Mock()
        mock_web.title = 'Web Page'
        mock_web.uri = 'https://example.com'
        mock_chunk.web = mock_web
        mock_chunk.retrieved_context = None

        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = [mock_chunk]
        mock_grounding.grounding_supports = []

        interface = ChatInterface()
        result = interface._format_citations_markdown(mock_grounding)

        assert 'Web Page' in result
        assert 'https://example.com' in result


class TestShowHelp:
    """Test cases for show_help method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_show_help_displays_commands(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test that help displays all available commands."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.show_help()

        captured = capsys.readouterr()
        assert 'AVAILABLE COMMANDS' in captured.out
        assert '/create' in captured.out
        assert '/list' in captured.out
        assert '/select' in captured.out
        assert '/delete' in captured.out
        assert '/upload' in captured.out
        assert '/store' in captured.out
        assert '/start' in captured.out
        assert '/reset' in captured.out
        assert '/history' in captured.out
        assert '/export' in captured.out
        assert '/help' in captured.out
        assert '/quit' in captured.out


class TestCmdStoreInfo:
    """Test cases for cmd_store_info method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_store_info_no_store(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test store info when no store is selected."""
        mock_validate.return_value = True

        interface = ChatInterface()
        interface.current_store = None
        interface.cmd_store_info()

        captured = capsys.readouterr()
        assert 'No store currently selected' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_store_info_with_store(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test store info when store is selected."""
        mock_validate.return_value = True

        mock_store = Mock()
        mock_store.name = 'store-123'
        mock_store.display_name = 'Test Store'
        mock_store.create_time = '2024-01-01T00:00:00Z'

        interface = ChatInterface()
        interface.current_store = mock_store
        interface.cmd_store_info()

        captured = capsys.readouterr()
        assert 'CURRENT STORE INFORMATION' in captured.out
        assert 'store-123' in captured.out
        assert 'Test Store' in captured.out


class TestCmdResetChat:
    """Test cases for cmd_reset_chat method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_reset_chat_no_session(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test reset chat when no session exists."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_client_instance.chat = None
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_reset_chat()

        captured = capsys.readouterr()
        assert 'No active chat session' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_reset_chat_with_session(self, mock_fsm, mock_client, mock_validate):
        """Test reset chat when session exists."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_chat = Mock()
        mock_client_instance.chat = mock_chat
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_reset_chat()

        mock_client_instance.reset_chat.assert_called_once()


class TestCmdShowHistory:
    """Test cases for cmd_show_history method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_show_history_empty(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test show history when history is empty."""
        mock_validate.return_value = True

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = []
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_show_history()

        captured = capsys.readouterr()
        assert 'No chat history available' in captured.out

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_show_history_with_messages(self, mock_fsm, mock_client, mock_validate, capsys):
        """Test show history with messages."""
        mock_validate.return_value = True

        # Create mock messages
        mock_message1 = Mock()
        mock_message1.role = 'user'
        mock_part1 = Mock()
        mock_part1.text = 'Hello'
        mock_message1.parts = [mock_part1]

        mock_message2 = Mock()
        mock_message2.role = 'model'
        mock_part2 = Mock()
        mock_part2.text = 'Hi there'
        mock_message2.parts = [mock_part2]

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message1, mock_message2]
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_show_history()

        captured = capsys.readouterr()
        assert 'CHAT HISTORY' in captured.out
        assert 'USER:' in captured.out.upper()
        assert 'MODEL:' in captured.out.upper()
        assert 'Hello' in captured.out
        assert 'Hi there' in captured.out


class TestCmdListStores:
    """Test cases for cmd_list_stores method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_cmd_list_stores_calls_display(self, mock_fsm, mock_client, mock_validate):
        """Test that list stores calls display_stores_summary."""
        mock_validate.return_value = True

        mock_fsm_instance = Mock()
        mock_fsm.return_value = mock_fsm_instance

        interface = ChatInterface()
        interface.cmd_list_stores()

        mock_fsm_instance.display_stores_summary.assert_called_once()


class TestMainMenuLoop:
    """Test cases for main_menu loop handling."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input')
    def test_main_menu_empty_input(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test that empty input is handled correctly."""
        mock_validate.return_value = True

        # First call returns empty string, second call triggers exit
        mock_input.side_effect = ['', '/quit']

        interface = ChatInterface()
        interface.is_running = True
        interface.main_menu()

        assert interface.is_running is False

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input')
    def test_main_menu_keyboard_interrupt(self, mock_input, mock_fsm, mock_client, mock_validate, capsys):
        """Test that KeyboardInterrupt is handled gracefully."""
        mock_validate.return_value = True
        mock_input.side_effect = KeyboardInterrupt()

        interface = ChatInterface()
        interface.is_running = True
        interface.main_menu()

        captured = capsys.readouterr()
        assert 'Interrupted by user' in captured.out
        assert interface.is_running is False

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input')
    def test_main_menu_exception_handling(self, mock_input, mock_fsm, mock_client, mock_validate, capsys):
        """Test that exceptions are handled gracefully."""
        mock_validate.return_value = True

        # First input raises exception, second quits
        mock_input.side_effect = [ValueError('Test error'), '/quit']

        interface = ChatInterface()
        interface.is_running = True

        # Mock handle_command to raise an error
        original_handle = interface.handle_command
        def handle_with_error(cmd):
            if cmd != '/quit':
                raise ValueError('Test error')
            original_handle(cmd)

        interface.handle_command = handle_with_error
        interface.main_menu()

        captured = capsys.readouterr()
        assert 'Error:' in captured.out


class TestFormatCitationsMarkdownComplete:
    """Additional tests for _format_citations_markdown method."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_format_citations_with_file_search_chunks(self, mock_fsm, mock_client, mock_validate):
        """Test formatting citations with file search chunks."""
        mock_validate.return_value = True

        mock_chunk = Mock()
        mock_chunk.web = None
        mock_retrieved = Mock()
        mock_retrieved.uri = 'document.pdf'
        mock_retrieved.title = 'Test Document'
        mock_chunk.retrieved_context = mock_retrieved

        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = [mock_chunk]
        mock_grounding.grounding_supports = []

        interface = ChatInterface()
        result = interface._format_citations_markdown(mock_grounding)

        assert 'Citations' in result
        assert 'document.pdf' in result
        assert 'Test Document' in result

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    def test_format_citations_with_grounding_supports(self, mock_fsm, mock_client, mock_validate):
        """Test formatting citations with grounding supports."""
        mock_validate.return_value = True

        mock_grounding = Mock()
        mock_grounding.search_entry_point = None
        mock_grounding.grounding_chunks = []
        mock_grounding.grounding_supports = [Mock(), Mock()]

        interface = ChatInterface()
        result = interface._format_citations_markdown(mock_grounding)

        assert '2 segment(s) grounded' in result


class TestExportChatEdgeCases:
    """Additional edge case tests for export chat."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.open', new_callable=mock_open)
    @patch('pathlib.Path.mkdir')
    def test_cmd_export_chat_with_md_extension(self, mock_mkdir, mock_file, mock_fsm, mock_client, mock_validate):
        """Test exporting chat with .md extension already included."""
        mock_validate.return_value = True

        mock_message = Mock()
        mock_message.role = 'user'
        mock_part = Mock()
        mock_part.text = 'Test'
        mock_message.parts = [mock_part]
        mock_message.candidates = []

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message]
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()
        interface.cmd_export_chat('test.md')

        mock_file.assert_called_once()
        call_args = mock_file.call_args
        # Should not add .md twice
        assert str(call_args[0][0]).endswith('.md')
        assert not str(call_args[0][0]).endswith('.md.md')

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.open')
    @patch('pathlib.Path.mkdir')
    def test_cmd_export_chat_write_error(self, mock_mkdir, mock_file, mock_fsm, mock_client, mock_validate, capsys):
        """Test export chat when file write fails."""
        mock_validate.return_value = True

        mock_message = Mock()
        mock_message.role = 'user'
        mock_part = Mock()
        mock_part.text = 'Test'
        mock_message.parts = [mock_part]

        mock_client_instance = Mock()
        mock_client_instance.get_chat_history.return_value = [mock_message]
        mock_client.return_value = mock_client_instance

        # Make file open raise an error
        mock_file.side_effect = IOError('Write failed')

        interface = ChatInterface()
        interface.cmd_export_chat('test')

        captured = capsys.readouterr()
        assert 'Error exporting chat' in captured.out


class TestChatInterfaceIntegration:
    """Integration tests for ChatInterface."""

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input')
    def test_command_parsing(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test that commands are parsed correctly."""
        mock_validate.return_value = True

        interface = ChatInterface()

        # Test command with no arguments
        interface.handle_command('/help')

        # Test command with arguments
        interface.handle_command('/create my-store')

        # Test command with multiple words
        interface.handle_command('/select store-with-long-name')

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='y')
    def test_full_workflow_create_select_upload(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test complete workflow: create store, select it, upload files."""
        mock_validate.return_value = True

        # Setup mocks
        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.create_store.return_value = mock_store
        mock_fsm_instance.upload_files_from_directory.return_value = 3
        mock_fsm.return_value = mock_fsm_instance

        mock_client_instance = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()

        # Create and select store
        interface.cmd_create_store('test-store')
        assert interface.current_store == mock_store

        # Upload files
        interface.cmd_upload_files()
        mock_fsm_instance.upload_files_from_directory.assert_called_once()

    @patch('src.chat_interface.Config.validate')
    @patch('src.chat_interface.GeminiChatClient')
    @patch('src.chat_interface.FileSearchManager')
    @patch('builtins.input', return_value='yes')
    def test_full_workflow_with_delete(self, mock_input, mock_fsm, mock_client, mock_validate):
        """Test complete workflow including store deletion."""
        mock_validate.return_value = True

        mock_store = Mock()
        mock_store.name = 'store-123'

        mock_fsm_instance = Mock()
        mock_fsm_instance.create_store.return_value = mock_store
        mock_fsm_instance.get_store.return_value = mock_store
        mock_fsm_instance.delete_store.return_value = True
        mock_fsm.return_value = mock_fsm_instance

        mock_client_instance = Mock()
        mock_client.return_value = mock_client_instance

        interface = ChatInterface()

        # Select and delete store
        interface.cmd_select_store('store-123')
        assert interface.current_store == mock_store

        interface.cmd_delete_store('store-123')
        assert interface.current_store is None
