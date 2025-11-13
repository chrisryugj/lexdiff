"""File Search Store Manager for managing file search stores and files."""

import time
from pathlib import Path
from typing import List, Optional
from google import genai
from google.genai.errors import APIError


class FileSearchManager:
    """Manager for file search stores and file operations."""

    def __init__(self, client: genai.Client, store_prefix: str = 'file-search-chat'):
        """Initialize the FileSearchManager.

        Args:
            client: Initialized Gemini client
            store_prefix: Prefix for file search store display names
        """
        self.client = client
        self.store_prefix = store_prefix

    def create_store(self, display_name: Optional[str] = None) -> any:
        """Create a new file search store.

        Args:
            display_name: Optional display name for the store

        Returns:
            Created file search store object
        """
        if not display_name:
            display_name = f"{self.store_prefix}-{int(time.time())}"

        try:
            store = self.client.file_search_stores.create(
                config={'display_name': display_name}
            )
            print(f"Created file search store: {store.name}")
            print(f"Display name: {display_name}")
            return store
        except APIError as e:
            print(f"Error creating file search store: {e}")
            raise

    def list_stores(self) -> List[any]:
        """List all file search stores.

        Returns:
            List of file search store objects
        """
        try:
            stores = list(self.client.file_search_stores.list())
            return stores
        except APIError as e:
            print(f"Error listing file search stores: {e}")
            return []

    def get_store(self, store_name: str) -> Optional[any]:
        """Get a specific file search store by name.

        Args:
            store_name: Name of the file search store

        Returns:
            File search store object or None if not found
        """
        try:
            store = self.client.file_search_stores.get(name=store_name)
            return store
        except APIError as e:
            print(f"Error getting file search store: {e}")
            return None

    def delete_store(self, store_name: str, force: bool = True) -> bool:
        """Delete a file search store.

        Args:
            store_name: Name of the file search store
            force: Whether to force delete even if store contains files

        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.file_search_stores.delete(
                name=store_name,
                config={'force': force}
            )
            print(f"Deleted file search store: {store_name}")
            return True
        except APIError as e:
            print(f"Error deleting file search store: {e}")
            return False

    def upload_file_to_store(
        self,
        file_path: Path,
        store_name: str,
        display_name: Optional[str] = None
    ) -> bool:
        """Upload a file directly to a file search store.

        Args:
            file_path: Path to the file to upload
            store_name: Name of the file search store
            display_name: Optional display name for the file (used in citations)

        Returns:
            True if successful, False otherwise
        """
        if not file_path.exists():
            print(f"Error: File not found: {file_path}")
            return False

        if not display_name:
            display_name = file_path.name

        try:
            print(f"Uploading {file_path.name} to {store_name}...")

            operation = self.client.file_search_stores.upload_to_file_search_store(
                file=str(file_path),
                file_search_store_name=store_name,
                config={
                    'display_name': display_name,
                }
            )

            # Wait for the upload operation to complete
            while not operation.done:
                time.sleep(2)
                operation = self.client.operations.get(operation)

            print(f"Successfully uploaded: {display_name}")
            return True

        except APIError as e:
            print(f"Error uploading file: {e}")
            return False

    def upload_files_from_directory(
        self,
        directory: Path,
        store_name: str
    ) -> int:
        """Upload all files from a directory to a file search store.

        Args:
            directory: Path to the directory containing files
            store_name: Name of the file search store

        Returns:
            Number of files successfully uploaded
        """
        if not directory.exists() or not directory.is_dir():
            print(f"Error: Directory not found or invalid: {directory}")
            return 0

        files = [f for f in directory.iterdir() if f.is_file()]

        if not files:
            print(f"No files found in {directory}")
            return 0

        print(f"\nFound {len(files)} file(s) in {directory}")

        success_count = 0
        for file_path in files:
            if self.upload_file_to_store(file_path, store_name):
                success_count += 1

        print(f"\nSuccessfully uploaded {success_count}/{len(files)} files")
        return success_count

    def list_files_in_store(self, store_name: str) -> List[any]:
        """List all files in a file search store.

        Args:
            store_name: Name of the file search store

        Returns:
            List of file objects in the store
        """
        try:
            # Note: The API provides file information through the store's metadata
            # This is a placeholder - actual implementation depends on API capabilities
            store = self.get_store(store_name)
            if store:
                print(f"\nFile Search Store: {store.name}")
                print(
                    f"Display Name: {store.display_name if hasattr(store, 'display_name') else 'N/A'}")
                # Additional file listing would depend on API capabilities
                return []
            return []
        except APIError as e:
            print(f"Error listing files in store: {e}")
            return []

    def display_stores_summary(self):
        """Display a summary of all file search stores."""
        stores = self.list_stores()

        if not stores:
            print("\nNo file search stores found.")
            return

        print(f"\n{'='*70}")
        print(f"File Search Stores ({len(stores)})")
        print(f"{'='*70}")

        for i, store in enumerate(stores, 1):
            print(f"\n{i}. Store Name: {store.name}")
            if hasattr(store, 'display_name'):
                print(f"   Display Name: {store.display_name}")
            if hasattr(store, 'create_time'):
                print(f"   Created: {store.create_time}")

        print(f"\n{'='*70}")
