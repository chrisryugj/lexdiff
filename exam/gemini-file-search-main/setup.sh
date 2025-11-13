#!/bin/bash

# Gemini File Search Chat Application Setup Script

echo "========================================="
echo "Gemini File Search Chat Setup"
echo "========================================="
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed."
    echo "Please install Python 3.8 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "Found Python version: $PYTHON_VERSION"

# Check if .env file exists
if [ ! -f .env ]; then
    echo ""
    echo "Warning: .env file not found!"
    echo "Creating .env template..."
    echo "GEMINI_API_KEY=your_api_key_here" > .env
    echo ""
    echo "Please edit .env and add your GEMINI_API_KEY"
    echo "Get your API key from: https://ai.google.dev/"
    echo ""
fi

# Create virtual environment
echo ""
echo "Creating virtual environment..."
if [ -d "venv" ]; then
    echo "Virtual environment already exists. Skipping creation."
else
    python3 -m venv venv
    echo "Virtual environment created."
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "To run the application:"
echo "  1. Make sure you've added your API key to .env"
echo "  2. Activate the virtual environment: source venv/bin/activate"
echo "  3. Run the application: python main.py"
echo ""
echo "To deactivate the virtual environment: deactivate"
echo ""
