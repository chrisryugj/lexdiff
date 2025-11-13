# Test Suite Documentation

This directory contains comprehensive tests for the Gemini File Search Chat Application.

## Test Structure

```
tests/
├── __init__.py                    # Test package initialization
├── test_config.py                 # Tests for Config module
├── test_file_search_manager.py    # Tests for FileSearchManager
├── test_gemini_client.py          # Tests for GeminiChatClient
├── test_chat_interface.py         # Tests for ChatInterface
└── README.md                      # This file
```

## Test Coverage

### test_config.py
Tests for the configuration module (`src/config.py`):
- Configuration attribute validation
- API key loading from environment
- Files directory creation
- Configuration validation logic
- Default values for all settings

**Test Classes:**
- `TestConfig` - Basic configuration tests
- `TestConfigIntegration` - Integration tests for full validation flow

### test_file_search_manager.py
Tests for the file search store management (`src/file_search_manager.py`):
- File search store creation, listing, retrieval, and deletion
- File upload to stores (single and batch)
- Directory scanning and file upload
- Error handling for API failures
- Store information display

**Test Classes:**
- `TestFileSearchManagerInit` - Initialization tests
- `TestCreateStore` - Store creation tests
- `TestListStores` - Store listing tests
- `TestGetStore` - Store retrieval tests
- `TestDeleteStore` - Store deletion tests
- `TestUploadFileToStore` - Single file upload tests
- `TestUploadFilesFromDirectory` - Batch upload tests
- `TestListFilesInStore` - File listing tests
- `TestDisplayStoresSummary` - Display functionality tests

### test_gemini_client.py
Tests for the Gemini API client wrapper (`src/gemini_client.py`):
- Client initialization with various configurations
- Chat session management (start, reset)
- Message sending with and without file search
- System instructions and thinking configuration
- Chat history retrieval
- Response display with citations
- Grounding metadata formatting

**Test Classes:**
- `TestGeminiChatClientInit` - Initialization tests
- `TestSetFileSearchStores` - File search configuration tests
- `TestStartChat` - Chat session tests
- `TestSendMessage` - Message sending tests
- `TestGetChatHistory` - History retrieval tests
- `TestDisplayResponse` - Response display tests
- `TestDisplayCitations` - Citation formatting tests
- `TestResetChat` - Chat reset tests
- `TestGeminiChatClientIntegration` - Full workflow tests

### test_chat_interface.py
Tests for the interactive chat interface (`src/chat_interface.py`):
- Interface initialization and startup
- Command parsing and handling
- Chat message processing
- Store management commands
- File upload functionality
- Chat history export
- Citation formatting for markdown

**Test Classes:**
- `TestChatInterfaceInit` - Initialization tests
- `TestStartMethod` - Startup tests
- `TestDisplayWelcome` - Welcome message tests
- `TestHandleCommand` - Command parsing tests
- `TestHandleChatMessage` - Chat message tests
- `TestCmdCreateStore` - Store creation command tests
- `TestCmdSelectStore` - Store selection command tests
- `TestCmdDeleteStore` - Store deletion command tests
- `TestCmdUploadFiles` - File upload command tests
- `TestCmdStartChat` - Chat start command tests
- `TestCmdExportChat` - Chat export tests
- `TestFormatCitationsMarkdown` - Markdown formatting tests
- `TestChatInterfaceIntegration` - Integration tests

## Running the Tests

### Prerequisites

1. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```

2. Install test dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Run All Tests

```bash
pytest
```

### Run Specific Test Files

```bash
# Test only config module
pytest tests/test_config.py

# Test only file search manager
pytest tests/test_file_search_manager.py

# Test only gemini client
pytest tests/test_gemini_client.py

# Test only chat interface
pytest tests/test_chat_interface.py
```

### Run Specific Test Classes

```bash
# Run a specific test class
pytest tests/test_config.py::TestConfig

# Run a specific test method
pytest tests/test_config.py::TestConfig::test_validate_with_api_key
```

### Run Tests with Coverage

```bash
# Run with coverage report
pytest --cov=src --cov-report=term-missing

# Generate HTML coverage report
pytest --cov=src --cov-report=html
# Then open htmlcov/index.html in a browser
```

### Run Tests with Verbose Output

```bash
pytest -v
```

### Run Tests with Extra Verbose Output (Show All Output)

```bash
pytest -vv -s
```

### Run Tests by Markers

The test suite includes markers for categorizing tests:

```bash
# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Run only tests that don't require API access
pytest -m "not requires_api"

# Run slow tests
pytest -m slow
```

## Test Options (pytest.ini)

The `pytest.ini` file in the project root configures pytest with the following options:

- **Coverage reporting**: Automatically generates coverage reports
- **Verbose output**: Shows detailed test results
- **Test discovery**: Finds all `test_*.py` files
- **Markers**: Categorizes tests (unit, integration, slow, requires_api)

## Coverage Goals

The test suite aims for:
- **Line coverage**: > 85%
- **Branch coverage**: > 75%
- **All critical paths**: 100% coverage

Current coverage can be viewed by running:
```bash
pytest --cov=src --cov-report=term-missing
```

## Mocking Strategy

The tests extensively use mocking to:
1. **Isolate units**: Test individual components without dependencies
2. **Avoid API calls**: Mock `google-genai` API calls to avoid rate limits and costs
3. **Speed up tests**: Mock time.sleep() and I/O operations
4. **Control behavior**: Simulate various API responses (success, errors, edge cases)

### Common Mocking Patterns

```python
# Mock the genai Client
@patch('src.gemini_client.genai.Client')
def test_something(mock_genai_client):
    # Test code here
    pass

# Mock file system operations
@patch('builtins.open', new_callable=mock_open)
def test_file_operation(mock_file):
    # Test code here
    pass

# Mock user input
@patch('builtins.input', return_value='yes')
def test_user_confirmation(mock_input):
    # Test code here
    pass
```

## Writing New Tests

When adding new functionality:

1. **Create tests first** (TDD approach recommended)
2. **Follow naming conventions**:
   - Test files: `test_<module_name>.py`
   - Test classes: `Test<FeatureName>`
   - Test methods: `test_<specific_behavior>`
3. **Use descriptive test names**: Test name should describe what is being tested
4. **Test edge cases**: Include tests for error conditions, empty inputs, etc.
5. **Mock external dependencies**: Don't make real API calls
6. **Keep tests isolated**: Each test should be independent

### Example Test Template

```python
"""Tests for the NewFeature module."""

import pytest
from unittest.mock import Mock, patch
from src.new_feature import NewFeature


class TestNewFeature:
    """Test cases for NewFeature class."""

    def test_basic_functionality(self):
        """Test that basic feature works as expected."""
        # Arrange
        feature = NewFeature()

        # Act
        result = feature.do_something()

        # Assert
        assert result == expected_value

    @patch('src.new_feature.external_dependency')
    def test_with_mocked_dependency(self, mock_dep):
        """Test feature with mocked external dependency."""
        # Arrange
        mock_dep.return_value = 'mocked_value'
        feature = NewFeature()

        # Act
        result = feature.do_something()

        # Assert
        assert result == 'expected_result'
        mock_dep.assert_called_once()

    def test_error_handling(self):
        """Test that errors are handled correctly."""
        feature = NewFeature()

        with pytest.raises(ValueError):
            feature.do_something_invalid()
```

## Continuous Integration

These tests are designed to be run in CI/CD pipelines. Example GitHub Actions workflow:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.13'
      - run: pip install -r requirements.txt
      - run: pytest --cov=src --cov-report=xml
      - uses: codecov/codecov-action@v2
```

## Test Data

Tests use:
- **Mock objects**: For simulating API responses
- **Temporary directories**: Created by pytest's `tmp_path` fixture
- **In-memory data**: No persistent test data files needed

## Troubleshooting

### Tests fail due to import errors

Ensure you're running tests from the project root:
```bash
cd /path/to/gemini-file-search
pytest
```

### Mock-related errors

Make sure you're patching the correct location:
- Patch where the object is **used**, not where it's defined
- Example: If `src.gemini_client` imports `genai`, patch `src.gemini_client.genai`

### Coverage not generating

Install coverage dependencies:
```bash
pip install pytest-cov
```

## Additional Resources

- [pytest Documentation](https://docs.pytest.org/)
- [unittest.mock Documentation](https://docs.python.org/3/library/unittest.mock.html)
- [pytest-cov Documentation](https://pytest-cov.readthedocs.io/)

## Contributing

When contributing tests:
1. Ensure all tests pass before submitting
2. Maintain or improve code coverage
3. Follow existing test patterns and naming conventions
4. Document complex test scenarios
5. Update this README if adding new test categories
