"""Main entry point for the Gemini File Search Chat Application."""

from src.chat_interface import ChatInterface
import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent))


def main():
    """Main function to start the application."""
    try:
        chat_interface = ChatInterface()
        chat_interface.start()
    except KeyboardInterrupt:
        print("\n\nApplication interrupted by user.")
    except Exception as e:
        print(f"\nFatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
