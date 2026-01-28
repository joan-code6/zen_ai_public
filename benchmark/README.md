# Benchmark: Needle in a Haystack

This benchmark tests semantic similarity's ability to find relevant information (the "needle") among many distracting notes (the "haystack").

## 📋 Overview

The benchmark evaluates semantic search capabilities:
1. Use semantic similarity to find relevant notes based on content
2. Filter out irrelevant "useless" notes that also contain trigger words
3. Avoid being confused by "trick" notes that are related but incorrect
4. Correctly answer questions using only the important notes

## 🎯 Key Features

- **All notes have trigger words**: Important, trick, AND useless notes all contain trigger words for semantic similarity testing
- **Configurable difficulty**: Adjust the number of useless notes added to the context
- **Binary evaluation**: LLM judge via OpenRouter returns only "correct" or "incorrect"
- **🚀 NO FIREBASE REQUIRED**: Standalone implementation with in-memory semantic search
- **OpenRouter Integration**: Access multiple LLMs (Gemini, GPT-4, Claude, etc.) with one API key
- **Optional dependencies**: Works with minimal dependencies, enhanced with sentence-transformers
- **Flexible**: Uses keyword-based search if embeddings unavailable

## 📁 File Structure

```
benchmark/
├── README.md                 # This file
├── config.json              # Benchmark configuration
├── dataset_template.json    # Basic example dataset with 2 test cases
├── dataset_extended.json    # Extended dataset with 3 more diverse test cases
├── benchmark_runner.py      # Main benchmark script (NO FIREBASE!)
├── manage_benchmark.py      # Utility to manage datasets and config
├── requirements.txt         # Minimal dependencies (all optional!)
└── results.json            # Output results (generated after run)
└── results.json            # Output results (generated after run)
```

## 🔧 Dataset Structure

Each test case contains:

- **question**: The question to be answered
- **answer**: The expected correct answer
- **important_notes**: Notes containing the correct information (the "needle")
  - Each note has: `title`, `content`, `trigger_words`
- **trick_notes**: Related but incorrect/misleading notes
  - Each note has: `title`, `content`, `trigger_words`
- **useless_notes**: Completely unrelated notes (but still with trigger words!)
  - Each note has: `title`, `content`, `trigger_words`

### Example Test Case:

```json
{
  "id": "example_001",
  "question": "What is the capital of France?",
  "answer": "Paris",
  "important_notes": [
    {
      "title": "European Capitals",
      "content": "Paris is the capital and largest city of France...",
      "trigger_words": ["Paris", "France", "capital", "European", "city", "Seine"]
    }
  ],
  "trick_notes": [
    {
      "title": "French Cities",
      "content": "Lyon is a major city in France...",
      "trigger_words": ["Lyon", "France", "city", "architecture", "cuisine"]
    }
  ],
  "useless_notes": [
    {
      "title": "Programming Languages",
      "content": "Python is a popular programming language...",
      "trigger_words": ["Python", "programming", "language", "code", "development"]
    }
  ]
}
```

## ⚙️ Configuration

Edit `config.json` to customize the benchmark:

```json
{
  "benchmark_config": {
    "settings": {
      "num_useless_notes_to_append": 10,
      "max_context_notes": 20,
      "similarity_threshold": 0.7,
      "use_semantic_search": true,
      "model_selection": {
        "use_openrouter": true,
        "default_model": "google/gemini-2.0-flash-exp:free",
        "judge_model": "google/gemini-2.0-flash-exp:free"
      }
    }
  }
}
```

### Configuration Options:

- **num_useless_notes_to_append**: How many useless notes to add to each test's context
- **max_context_notes**: Maximum total notes in context
- **similarity_threshold**: Minimum similarity score for note retrieval
- **use_semantic_search**: Enable/disable semantic similarity search
- **model_selection**: Configure which models to use via OpenRouter

## 🚀 Running the Benchmark

### Installation (Optional Dependencies):

```bash
cd benchmark

# Install recommended dependencies (optional!)
pip install -r requirements.txt

# Or install individually:
pip install sentence-transformers  # For better semantic similarity
pip install requests               # For OpenRouter API calls
```

**Note**: The benchmark works without any dependencies! It will use:
- Keyword-based similarity (if sentence-transformers not installed)
- Simple string matching for judging (if no OPENROUTER_API_KEY)

### Set API Key (Optional):

```bash
# On Linux/Mac:
export OPENROUTER_API_KEY='your-api-key-here'

# On Windows PowerShell:
$env:OPENROUTER_API_KEY='your-api-key-here'

# On Windows CMD:
set OPENROUTER_API_KEY=your-api-key-here
```

Get your free API key from: **https://openrouter.ai/keys**

**Why OpenRouter?** Access to multiple models (Gemini, GPT-4, Claude, etc.) with a single API key!

### Quick Start:

```bash
# View current configuration
python manage_benchmark.py --info

# List available datasets
python manage_benchmark.py --list

# Run benchmark with default dataset
python benchmark_runner.py
```

### Using Different Datasets:

```bash
# Switch to extended dataset
python manage_benchmark.py --dataset extended

# Switch back to template dataset
python manage_benchmark.py --dataset template

# Run the benchmark
python benchmark_runner.py
```

### Expected Output:

```
Initializing Benchmark Runner...

[INIT] Loading sentence-transformers model...
[INIT] ✓ Embeddings enabled
[INIT] ✓ OPENROUTER_API_KEY found
[INIT] Default model: google/gemini-2.0-flash-exp:free
[INIT] Judge model: google/gemini-2.0-flash-exp:free
================================================================================
BENCHMARK: Needle in a Haystack - AI Wrapper Test
================================================================================
Dataset: dataset_template.json
Test Cases: 2
Useless Notes per Test: 10
================================================================================

Running Test: example_001
Question: What is the capital of France?
Context prepared: 8 total notes
  - Important notes: 1
  - Trick notes: 2
  - Useless notes: 5
[SEMANTIC SEARCH] Finding relevant notes for: 'What is the capital of France?'
[SEMANTIC SEARCH] Found 8 relevant notes
[SEMANTIC SEARCH] Top similarity score: 0.524
[OPENROUTER] Querying google/gemini-2.0-flash-exp:free...
[OPENROUTER] AI Response: Paris is the capital of France.
[JUDGE] Evaluating response with google/gemini-2.0-flash-exp:free...
[JUDGE] Judgment: correct
✓ PASSED

Running Test: example_002
Question: Who wrote Romeo and Juliet?
Context prepared: 8 total notes
  - Important notes: 1
  - Trick notes: 2
  - Useless notes: 5
[SEMANTIC SEARCH] Finding relevant notes for: 'Who wrote Romeo and Juliet?'
[SEMANTIC SEARCH] Found 8 relevant notes
[SEMANTIC SEARCH] Top similarity score: 0.487
[OPENROUTER] Querying google/gemini-2.0-flash-exp:free...
[OPENROUTER] AI Response: William Shakespeare wrote Romeo and Juliet.
[JUDGE] Evaluating response with google/gemini-2.0-flash-exp:free...
[JUDGE] Judgment: correct
✓ PASSED

================================================================================
BENCHMARK RESULTS
================================================================================
Total Tests: 2
Passed: 2
Failed: 0
Success Rate: 100.00%
================================================================================

Results saved to: results.json
```

## 📊 Results

After running, `results.json` will contain:

```json
{
  "total_tests": 2,
  "passed": 2,
  "failed": 0,
  "test_results": [
    {
      "id": "example_001",
      "question": "What is the capital of France?",
      "expected_answer": "Paris",
      "actual_answer": "Paris",
      "correct": true,
      "num_context_notes": 13
    }
  ]
}
```

## 📝 Creating Your Own Dataset

1. Copy `dataset_template.json` to a new file
2. Add your test cases following the structure
3. **Important**: Ensure ALL notes (important, trick, AND useless) have trigger words
4. Update `config.json` to point to your new dataset
5. Run the benchmark

### Tips for Creating Test Cases:

- **Important notes**: Should contain the answer and relevant trigger words
- **Trick notes**: Should be topically related but contain wrong information
- **Useless notes**: Should be completely unrelated BUT still have trigger words (for semantic similarity testing)
- **Trigger words**: Should be meaningful keywords that semantic similarity can use

## 🔍 Why Trigger Words in Useless Notes?

Semantic similarity systems use content and keywords to find relevant information. By including trigger words in useless notes, we test whether the system can:

1. **Distinguish relevance**: Can it tell truly relevant notes from irrelevant ones, even when both have trigger words?
2. **Handle noise**: Can semantic similarity work when there's noise in the haystack?
3. **Precision**: Does it retrieve the right notes, not just any notes with trigger words?

This makes the benchmark more realistic and challenging!

## 🎓 Implementation Details

### ✅ Fully Functional - No Firebase Required!

**Semantic Search:**
- **In-memory implementation**: No database needed!
- **Embedding-based** (if sentence-transformers installed): Uses all-MiniLM-L6-v2 model for semantic similarity
- **Keyword-based fallback**: Works even without sentence-transformers using Jaccard similarity
- **Flexible**: Automatically adapts to available dependencies

**LLM Integration via OpenRouter:**
- **OpenRouter API** (if OPENROUTER_API_KEY set): Access to multiple models (Gemini, GPT-4, Claude, Llama, etc.)
- **Binary evaluation**: "correct"/"incorrect" judgment
- **String matching fallback**: Works without API key
- **Simple setup**: Just set environment variable, no Firebase needed
- **Model selection**: Configure default and judge models in config.json

**Error Handling:**
- Graceful degradation when dependencies missing
- Clear messages about what's available/missing
- Runs with zero dependencies (uses fallbacks)

### Dependencies (All Optional!):

```bash
# Recommended (for best results):
pip install sentence-transformers requests
export OPENROUTER_API_KEY='your-key'

# Minimal (works without any deps):
# Uses keyword-based search + string matching
```

### Why No Firebase?

The original Zen AI backend uses Firebase/Firestore for persistence. This benchmark is **standalone** and doesn't need any backend:
- ✅ No Firebase setup required
- ✅ No database configuration
- ✅ Works on any machine with Python
- ✅ In-memory semantic search
- ✅ Direct OpenRouter API calls (no backend)
- ✅ Access to multiple LLM models with one API key

## 📚 References

- Main Project: [Zen AI](https://github.com/joan-code6/zen_ai)
- Semantic Similarity: Uses sentence-transformers embeddings (all-MiniLM-L6-v2)
- OpenRouter API: Unified API for multiple LLMs
- Get OpenRouter API Key: https://openrouter.ai/keys
- Supported Models: https://openrouter.ai/models

---

**The benchmark is fully functional and standalone - no Firebase or backend setup required!**
