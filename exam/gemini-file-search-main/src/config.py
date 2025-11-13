"""Configuration module for Gemini File Search Chat Application."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration."""

    # API Configuration
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

    # Model Configuration
    MODEL_NAME = 'gemini-2.5-flash'

    # Thinking Configuration (dynamic thinking enabled)
    ENABLE_THINKING = True
    THINKING_BUDGET = None  # Use default thinking budget

    # File Search Configuration
    FILES_DIR = Path(__file__).parent.parent / 'files'
    FILE_SEARCH_STORE_PREFIX = 'file-search-chat'

    # System Instruction
    SYSTEM_INSTRUCTION = """You are a helpful AI assistant with access to a knowledge base through file search.
When answering questions, use the information from the uploaded documents to provide accurate and relevant answers.
Always cite your sources when using information from the documents."""

    @classmethod
    def validate(cls):
        """Validate configuration."""
        if not cls.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY not found in environment variables. "
                "Please set it in your .env file."
            )

        if not cls.FILES_DIR.exists():
            cls.FILES_DIR.mkdir(parents=True, exist_ok=True)

        return True
