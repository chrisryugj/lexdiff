"""Tests for the FileSearchManager module."""

import time
import pytest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, call
from google.genai.errors import APIError
from src.file_search_manager import FileSearchManager


class TestFileSearchManagerInit:
    """Test cases for FileSearchManager initialization."""

    def test_init_with_defaults(self):
        """Test initialization with default parameters."""
        mock_client = Mock()
        manager = FileSearchManager(mock_client)

        assert manager.client == mock_client
        assert manager.store_prefix == 'file-search-chat'

    def test_init_with_custom_prefix(self):
        """Test initialization with custom store prefix."""
        mock_client = Mock()
        custom_prefix = 'custom-prefix'
        manager = FileSearchManager(mock_client, store_prefix=custom_prefix)

        assert manager.client == mock_client
        assert manager.store_prefix == custom_prefix


class TestCreateStore:
    """Test cases for create_store method."""

    def test_create_store_with_display_name(self):
        """Test creating a store with custom display name."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'fileSearchStores/abc123'
        mock_client.file_search_stores.create.return_value = mock_store

        manager = FileSearchManager(mock_client)
        result = manager.create_store(display_name='test-store')

        assert result == mock_store
        mock_client.file_search_stores.create.assert_called_once_with(
            config={'display_name': 'test-store'}
        )

    def test_create_store_without_display_name(self):
        """Test creating a store without display name (auto-generated)."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'fileSearchStores/xyz789'
        mock_client.file_search_stores.create.return_value = mock_store

        manager = FileSearchManager(mock_client)

        with patch('time.time', return_value=1234567890):
            result = manager.create_store()

        assert result == mock_store
        mock_client.file_search_stores.create.assert_called_once()
        call_args = mock_client.file_search_stores.create.call_args
        assert 'config' in call_args[1]
        assert 'display_name' in call_args[1]['config']
        assert call_args[1]['config']['display_name'] == 'file-search-chat-1234567890'

    def test_create_store_api_error(self):
        """Test creating a store when API returns an error."""
        mock_client = Mock()
        mock_client.file_search_stores.create.side_effect = APIError(400, {'error': {'message': 'API Error'}})

        manager = FileSearchManager(mock_client)

        with pytest.raises(APIError):
            manager.create_store(display_name='test-store')


class TestListStores:
    """Test cases for list_stores method."""

    def test_list_stores_success(self):
        """Test listing stores successfully."""
        mock_client = Mock()
        mock_store1 = Mock()
        mock_store1.name = 'store1'
        mock_store2 = Mock()
        mock_store2.name = 'store2'
        mock_client.file_search_stores.list.return_value = [mock_store1, mock_store2]

        manager = FileSearchManager(mock_client)
        result = manager.list_stores()

        assert len(result) == 2
        assert result[0].name == 'store1'
        assert result[1].name == 'store2'

    def test_list_stores_empty(self):
        """Test listing stores when none exist."""
        mock_client = Mock()
        mock_client.file_search_stores.list.return_value = []

        manager = FileSearchManager(mock_client)
        result = manager.list_stores()

        assert len(result) == 0
        assert result == []

    def test_list_stores_api_error(self):
        """Test listing stores when API returns an error."""
        mock_client = Mock()
        mock_client.file_search_stores.list.side_effect = APIError(500, {'error': {'message': 'API Error'}})

        manager = FileSearchManager(mock_client)
        result = manager.list_stores()

        assert result == []


class TestGetStore:
    """Test cases for get_store method."""

    def test_get_store_success(self):
        """Test getting a specific store successfully."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'store1'
        mock_client.file_search_stores.get.return_value = mock_store

        manager = FileSearchManager(mock_client)
        result = manager.get_store('store1')

        assert result == mock_store
        mock_client.file_search_stores.get.assert_called_once_with(name='store1')

    def test_get_store_not_found(self):
        """Test getting a store that doesn't exist."""
        mock_client = Mock()
        mock_client.file_search_stores.get.side_effect = APIError(404, {'error': {'message': 'Not Found'}})

        manager = FileSearchManager(mock_client)
        result = manager.get_store('nonexistent')

        assert result is None


class TestDeleteStore:
    """Test cases for delete_store method."""

    def test_delete_store_success(self):
        """Test deleting a store successfully."""
        mock_client = Mock()
        manager = FileSearchManager(mock_client)

        result = manager.delete_store('store1', force=True)

        assert result is True
        mock_client.file_search_stores.delete.assert_called_once_with(
            name='store1',
            config={'force': True}
        )

    def test_delete_store_without_force(self):
        """Test deleting a store without force flag."""
        mock_client = Mock()
        manager = FileSearchManager(mock_client)

        result = manager.delete_store('store1', force=False)

        assert result is True
        mock_client.file_search_stores.delete.assert_called_once_with(
            name='store1',
            config={'force': False}
        )

    def test_delete_store_api_error(self):
        """Test deleting a store when API returns an error."""
        mock_client = Mock()
        mock_client.file_search_stores.delete.side_effect = APIError(500, {'error': {'message': 'Delete Failed'}})

        manager = FileSearchManager(mock_client)
        result = manager.delete_store('store1')

        assert result is False


class TestUploadFileToStore:
    """Test cases for upload_file_to_store method."""

    def test_upload_file_success(self, tmp_path):
        """Test uploading a file successfully."""
        # Create a test file
        test_file = tmp_path / 'test.txt'
        test_file.write_text('test content')

        mock_client = Mock()
        mock_operation = Mock()
        mock_operation.done = False
        mock_client.file_search_stores.upload_to_file_search_store.return_value = mock_operation
        mock_client.operations.get.return_value = Mock(done=True)

        manager = FileSearchManager(mock_client)

        with patch('time.sleep'):  # Speed up test by mocking sleep
            result = manager.upload_file_to_store(test_file, 'store1')

        assert result is True
        mock_client.file_search_stores.upload_to_file_search_store.assert_called_once()

    def test_upload_file_with_custom_display_name(self, tmp_path):
        """Test uploading a file with custom display name."""
        test_file = tmp_path / 'test.txt'
        test_file.write_text('test content')

        mock_client = Mock()
        mock_operation = Mock()
        mock_operation.done = True
        mock_client.file_search_stores.upload_to_file_search_store.return_value = mock_operation

        manager = FileSearchManager(mock_client)
        result = manager.upload_file_to_store(
            test_file,
            'store1',
            display_name='custom_name.txt'
        )

        assert result is True
        call_args = mock_client.file_search_stores.upload_to_file_search_store.call_args
        assert call_args[1]['config']['display_name'] == 'custom_name.txt'

    def test_upload_file_not_found(self):
        """Test uploading a file that doesn't exist."""
        mock_client = Mock()
        manager = FileSearchManager(mock_client)

        result = manager.upload_file_to_store(
            Path('/nonexistent/file.txt'),
            'store1'
        )

        assert result is False
        mock_client.file_search_stores.upload_to_file_search_store.assert_not_called()

    def test_upload_file_api_error(self, tmp_path):
        """Test uploading a file when API returns an error."""
        test_file = tmp_path / 'test.txt'
        test_file.write_text('test content')

        mock_client = Mock()
        mock_client.file_search_stores.upload_to_file_search_store.side_effect = APIError(500, {'error': {'message': 'Upload Failed'}})

        manager = FileSearchManager(mock_client)
        result = manager.upload_file_to_store(test_file, 'store1')

        assert result is False

    def test_upload_file_waits_for_completion(self, tmp_path):
        """Test that upload waits for operation to complete."""
        test_file = tmp_path / 'test.txt'
        test_file.write_text('test content')

        mock_client = Mock()

        # Simulate operation completing after 2 checks
        mock_operation1 = Mock(done=False)
        mock_operation2 = Mock(done=False)
        mock_operation3 = Mock(done=True)

        mock_client.file_search_stores.upload_to_file_search_store.return_value = mock_operation1
        mock_client.operations.get.side_effect = [mock_operation2, mock_operation3]

        manager = FileSearchManager(mock_client)

        with patch('time.sleep') as mock_sleep:
            result = manager.upload_file_to_store(test_file, 'store1')

        assert result is True
        assert mock_sleep.call_count == 2
        assert mock_client.operations.get.call_count == 2


class TestUploadFilesFromDirectory:
    """Test cases for upload_files_from_directory method."""

    def test_upload_files_from_directory_success(self, tmp_path):
        """Test uploading multiple files from a directory."""
        # Create test files
        (tmp_path / 'file1.txt').write_text('content1')
        (tmp_path / 'file2.txt').write_text('content2')
        (tmp_path / 'file3.txt').write_text('content3')

        mock_client = Mock()
        mock_operation = Mock(done=True)
        mock_client.file_search_stores.upload_to_file_search_store.return_value = mock_operation

        manager = FileSearchManager(mock_client)
        result = manager.upload_files_from_directory(tmp_path, 'store1')

        assert result == 3
        assert mock_client.file_search_stores.upload_to_file_search_store.call_count == 3

    def test_upload_files_from_empty_directory(self, tmp_path):
        """Test uploading from an empty directory."""
        mock_client = Mock()
        manager = FileSearchManager(mock_client)

        result = manager.upload_files_from_directory(tmp_path, 'store1')

        assert result == 0
        mock_client.file_search_stores.upload_to_file_search_store.assert_not_called()

    def test_upload_files_directory_not_found(self):
        """Test uploading from a non-existent directory."""
        mock_client = Mock()
        manager = FileSearchManager(mock_client)

        result = manager.upload_files_from_directory(
            Path('/nonexistent/directory'),
            'store1'
        )

        assert result == 0

    def test_upload_files_partial_success(self, tmp_path):
        """Test uploading files with some failures."""
        # Create test files
        (tmp_path / 'file1.txt').write_text('content1')
        (tmp_path / 'file2.txt').write_text('content2')

        mock_client = Mock()

        # First upload succeeds, second fails
        mock_operation_success = Mock(done=True)
        mock_client.file_search_stores.upload_to_file_search_store.side_effect = [
            mock_operation_success,
            APIError(500, {'error': {'message': 'Upload Failed'}})
        ]

        manager = FileSearchManager(mock_client)
        result = manager.upload_files_from_directory(tmp_path, 'store1')

        assert result == 1
        assert mock_client.file_search_stores.upload_to_file_search_store.call_count == 2

    def test_upload_files_ignores_subdirectories(self, tmp_path):
        """Test that subdirectories are ignored during upload."""
        # Create files and a subdirectory
        (tmp_path / 'file1.txt').write_text('content1')
        subdir = tmp_path / 'subdir'
        subdir.mkdir()
        (subdir / 'file2.txt').write_text('content2')

        mock_client = Mock()
        mock_operation = Mock(done=True)
        mock_client.file_search_stores.upload_to_file_search_store.return_value = mock_operation

        manager = FileSearchManager(mock_client)
        result = manager.upload_files_from_directory(tmp_path, 'store1')

        # Should only upload the file in the root directory
        assert result == 1


class TestListFilesInStore:
    """Test cases for list_files_in_store method."""

    def test_list_files_in_store_success(self):
        """Test listing files in a store."""
        mock_client = Mock()
        mock_store = Mock()
        mock_store.name = 'store1'
        mock_store.display_name = 'Test Store'
        mock_client.file_search_stores.get.return_value = mock_store

        manager = FileSearchManager(mock_client)
        result = manager.list_files_in_store('store1')

        # Currently returns empty list as per implementation
        assert result == []

    def test_list_files_in_store_not_found(self):
        """Test listing files in a non-existent store."""
        mock_client = Mock()
        mock_client.file_search_stores.get.side_effect = APIError(404, {'error': {'message': 'Not Found'}})

        manager = FileSearchManager(mock_client)
        result = manager.list_files_in_store('nonexistent')

        assert result == []


class TestDisplayStoresSummary:
    """Test cases for display_stores_summary method."""

    def test_display_stores_summary_with_stores(self, capsys):
        """Test displaying summary with stores."""
        mock_client = Mock()
        mock_store1 = Mock()
        mock_store1.name = 'store1'
        mock_store1.display_name = 'Test Store 1'
        mock_store1.create_time = '2024-01-01T00:00:00Z'

        mock_store2 = Mock()
        mock_store2.name = 'store2'
        mock_store2.display_name = 'Test Store 2'

        mock_client.file_search_stores.list.return_value = [mock_store1, mock_store2]

        manager = FileSearchManager(mock_client)
        manager.display_stores_summary()

        captured = capsys.readouterr()
        assert 'File Search Stores (2)' in captured.out
        assert 'store1' in captured.out
        assert 'store2' in captured.out

    def test_display_stores_summary_empty(self, capsys):
        """Test displaying summary with no stores."""
        mock_client = Mock()
        mock_client.file_search_stores.list.return_value = []

        manager = FileSearchManager(mock_client)
        manager.display_stores_summary()

        captured = capsys.readouterr()
        assert 'No file search stores found' in captured.out
