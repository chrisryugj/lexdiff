"""Tests for the Config module."""

import os
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from src.config import Config


class TestConfig:
    """Test cases for Config class."""

    def test_config_has_required_attributes(self):
        """Test that Config has all required attributes."""
        assert hasattr(Config, 'GEMINI_API_KEY')
        assert hasattr(Config, 'MODEL_NAME')
        assert hasattr(Config, 'ENABLE_THINKING')
        assert hasattr(Config, 'THINKING_BUDGET')
        assert hasattr(Config, 'FILES_DIR')
        assert hasattr(Config, 'FILE_SEARCH_STORE_PREFIX')
        assert hasattr(Config, 'SYSTEM_INSTRUCTION')

    def test_model_name_default(self):
        """Test that MODEL_NAME has correct default value."""
        assert Config.MODEL_NAME == 'gemini-2.5-flash'

    def test_enable_thinking_default(self):
        """Test that ENABLE_THINKING is True by default."""
        assert Config.ENABLE_THINKING is True

    def test_thinking_budget_default(self):
        """Test that THINKING_BUDGET is None by default."""
        assert Config.THINKING_BUDGET is None

    def test_file_search_store_prefix_default(self):
        """Test that FILE_SEARCH_STORE_PREFIX has correct default."""
        assert Config.FILE_SEARCH_STORE_PREFIX == 'file-search-chat'

    def test_system_instruction_not_empty(self):
        """Test that SYSTEM_INSTRUCTION is not empty."""
        assert Config.SYSTEM_INSTRUCTION
        assert isinstance(Config.SYSTEM_INSTRUCTION, str)
        assert len(Config.SYSTEM_INSTRUCTION) > 0

    def test_files_dir_is_path(self):
        """Test that FILES_DIR is a Path object."""
        assert isinstance(Config.FILES_DIR, Path)

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-api-key-123'})
    def test_validate_with_api_key(self):
        """Test validation succeeds when API key is present."""
        # Temporarily set the API key
        original_key = Config.GEMINI_API_KEY
        Config.GEMINI_API_KEY = 'test-api-key-123'

        try:
            result = Config.validate()
            assert result is True
        finally:
            Config.GEMINI_API_KEY = original_key

    def test_validate_without_api_key(self):
        """Test validation fails when API key is missing."""
        # Temporarily remove the API key
        original_key = Config.GEMINI_API_KEY
        Config.GEMINI_API_KEY = None

        try:
            with pytest.raises(ValueError, match="GEMINI_API_KEY not found"):
                Config.validate()
        finally:
            Config.GEMINI_API_KEY = original_key

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-api-key-123'})
    def test_validate_creates_files_directory(self, tmp_path):
        """Test that validate creates FILES_DIR if it doesn't exist."""
        # Temporarily set FILES_DIR to a non-existent path
        original_dir = Config.FILES_DIR
        test_dir = tmp_path / 'test_files'
        Config.FILES_DIR = test_dir
        Config.GEMINI_API_KEY = 'test-api-key-123'

        try:
            assert not test_dir.exists()
            Config.validate()
            assert test_dir.exists()
        finally:
            Config.FILES_DIR = original_dir

    def test_api_key_from_environment(self):
        """Test that API key is loaded from environment."""
        # This test checks that the config attempts to load from env
        # The actual value depends on the .env file
        api_key = Config.GEMINI_API_KEY
        assert api_key is None or isinstance(api_key, str)


class TestConfigIntegration:
    """Integration tests for Config class."""

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-integration-key'})
    def test_full_validation_flow(self, tmp_path):
        """Test complete validation flow."""
        original_key = Config.GEMINI_API_KEY
        original_dir = Config.FILES_DIR

        test_dir = tmp_path / 'integration_files'
        Config.FILES_DIR = test_dir
        Config.GEMINI_API_KEY = 'test-integration-key'

        try:
            # Directory should not exist yet
            assert not test_dir.exists()

            # Validate should succeed and create directory
            result = Config.validate()
            assert result is True
            assert test_dir.exists()
            assert test_dir.is_dir()
        finally:
            Config.GEMINI_API_KEY = original_key
            Config.FILES_DIR = original_dir
