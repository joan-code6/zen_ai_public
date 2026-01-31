"""
Benchmark Runner for "Needle in a Haystack" AI Wrapper

This script benchmarks the AI wrapper's ability to find the relevant information
(the needle) among many distracting notes (the haystack).

Key features:
- Loads test cases from dataset
- Appends configurable number of useless notes to context
- All notes (including useless ones) have trigger words for semantic similarity
- Uses LLM judge for binary correct/incorrect evaluation
- Standalone mode: No Firebase required! Uses in-memory semantic search
"""

import json
import os
import sys
import random
import re
from typing import Dict, List, Any, Optional
from pathlib import Path
import dotenv
import argparse
import datetime

dotenv.load_dotenv()
# Try to import optional dependencies for enhanced features
try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    _embeddings_available = True
except ImportError:
    _embeddings_available = False

try:
    import requests
    _requests_available = True
except ImportError:
    _requests_available = False


class StandaloneBenchmarkRunner:
    """Standalone benchmark runner that doesn't require Firebase."""
    
    def __init__(self, config_path: str = "config.json"):
        """Initialize the benchmark runner with configuration."""
        self.config = self._load_config(config_path)
        self.dataset = self._load_dataset()
        self.useless_notes = self._load_useless_notes()
        self.results = []
        
        # Cost tracking
        self.total_cost = 0.0
        self.total_tokens = 0
        
        # API configuration
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        
        # Get model configuration
        model_config = self.config['settings'].get('model_selection', {})
        self.default_model = model_config.get('default_model', 'google/gemini-2.0-flash-exp:free')
        self.judge_model = model_config.get('judge_model', 'google/gemini-2.0-flash-exp:free')
        
        # Initialize embedding model if available
        self.embedding_model = None
        if _embeddings_available:
            try:
                print("[INIT] Loading sentence-transformers model...")
                self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
                print("[INIT] ✓ Embeddings enabled")
            except Exception as e:
                print(f"[INIT] Warning: Could not load embedding model: {e}")
                print("[INIT] Will use keyword-based search instead")
        else:
            print("[INIT] sentence-transformers not installed")
            print("[INIT] Using keyword-based search (install with: pip install sentence-transformers)")
        
        if not self.api_key:
            print("[INIT] Warning: OPENROUTER_API_KEY not found in environment")
            print("[INIT] Set it with: export OPENROUTER_API_KEY='your-key-here'")
            print("[INIT] Get your key from: https://openrouter.ai/keys")
            print("[INIT] LLM judge will use simple string matching fallback")
        else:
            print("[INIT] ✓ OPENROUTER_API_KEY found")
            print(f"[INIT] Default model: {self.default_model}")
            print(f"[INIT] Judge model: {self.judge_model}")
        
        if not _requests_available:
            print("[INIT] Warning: requests library not installed")
            print("[INIT] Install with: pip install requests")
    
    def _calculate_cost(self, usage: Dict[str, Any], model: str) -> float:
        """Calculate cost for a single API call based on usage and model.
        
        This is a simplified cost calculation. In production, you'd want to use
        the actual pricing from OpenRouter's API or their pricing endpoint.
        """
        if not usage:
            return 0.0
            
        # Get token counts
        prompt_tokens = usage.get('prompt_tokens', 0)
        completion_tokens = usage.get('completion_tokens', 0)
        total_tokens = usage.get('total_tokens', prompt_tokens + completion_tokens)
        
        # Simplified pricing (these are approximate rates for common models)
        # You should update these with actual OpenRouter pricing
        model_pricing = {
            'z-ai/glm-4.5-air': {
                'prompt': 0.00002,  # $0.02 per 1M tokens
                'completion': 0.00002
            },
            'z-ai/glm-4.5-air:free': {
                'prompt': 0.0,  # Free tier
                'completion': 0.0
            },
            'google/gemini-2.0-flash-exp:free': {
                'prompt': 0.0,
                'completion': 0.0
            }
        }
        
        pricing = model_pricing.get(model, {'prompt': 0.00002, 'completion': 0.00002})
        
        cost = (prompt_tokens * pricing['prompt']) + (completion_tokens * pricing['completion'])
        return cost
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load benchmark configuration."""
        config_file = Path(__file__).parent / config_path
        try:
            with open(config_file, 'r') as f:
                return json.load(f)['benchmark_config']
        except FileNotFoundError:
            print(f"Error: Configuration file '{config_path}' not found.")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in configuration file: {e}")
            sys.exit(1)
        except KeyError:
            print("Error: Configuration file missing 'benchmark_config' key.")
            sys.exit(1)
    
    def _load_dataset(self) -> Dict[str, Any]:
        """Load the benchmark dataset."""
        dataset_path = Path(__file__).parent / self.config['dataset']['path']
        try:
            with open(dataset_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Error: Dataset file '{self.config['dataset']['path']}' not found.")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in dataset file: {e}")
            sys.exit(1)
    
    def _load_useless_notes(self) -> List[Dict[str, Any]]:
        """Load the useless notes dataset."""
        useless_notes_path = Path(__file__).parent / "datasets" / "dataset_useless_notes.json"
        try:
            with open(useless_notes_path, 'r') as f:
                data = json.load(f)
                return data.get('useless_notes', [])
        except FileNotFoundError:
            print(f"Warning: Useless notes file 'dataset_useless_notes.json' not found.")
            print("Will use empty list for useless notes.")
            return []
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in useless notes file: {e}")
            sys.exit(1)
    
    def _prepare_context(self, test_case: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Prepare the context by combining important notes, trick notes, and useless notes.
        
        All notes have trigger words for semantic similarity testing.
        """
        context_notes = []
        
        # Add important notes (the "needle")
        context_notes.extend(test_case['important_notes'])
        
        # Add trick notes (confusing/distracting but related)
        context_notes.extend(test_case['trick_notes'])
        
        # Add useless notes (completely unrelated but with trigger words)
        num_useless = self.config['settings']['num_useless_notes_to_append']
        available_useless = self.useless_notes
        
        # Randomly select useless notes to append
        if len(available_useless) > num_useless:
            selected_useless = random.sample(available_useless, num_useless)
        else:
            # If not enough useless notes, use all available
            selected_useless = available_useless
        
        context_notes.extend(selected_useless)
        
        # Shuffle the context to make it harder
        random.shuffle(context_notes)
        
        return context_notes
    
    def _format_context_for_ai(self, context_notes: List[Dict[str, Any]]) -> str:
        """Format context notes for the AI prompt."""
        formatted = "Available Notes:\n\n"
        for i, note in enumerate(context_notes, 1):
            formatted += f"Note {i}:\n"
            formatted += f"Title: {note['title']}\n"
            formatted += f"Content: {note['content']}\n"
            formatted += f"Keywords: {', '.join(note['trigger_words'])}\n"
            formatted += "\n"
        return formatted
    
    def _compute_similarity(self, text1: str, text2: str) -> float:
        """Compute semantic similarity between two texts."""
        if self.embedding_model:
            # Use embedding-based similarity
            try:
                emb1 = self.embedding_model.encode(text1, convert_to_numpy=True)
                emb2 = self.embedding_model.encode(text2, convert_to_numpy=True)
                # Cosine similarity
                similarity = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
                return float(similarity)
            except Exception as e:
                print(f"Warning: Embedding similarity failed: {e}")
                return self._keyword_similarity(text1, text2)
        else:
            # Fallback to keyword-based similarity
            return self._keyword_similarity(text1, text2)
    
    def _keyword_similarity(self, text1: str, text2: str) -> float:
        """Simple keyword-based similarity score."""
        # Tokenize and normalize
        words1 = set(re.findall(r'\w+', text1.lower()))
        words2 = set(re.findall(r'\w+', text2.lower()))
        
        if not words1 or not words2:
            return 0.0
        
        # Jaccard similarity
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        
        return intersection / union if union > 0 else 0.0
    
    def _find_relevant_notes(self, question: str, context_notes: List[Dict[str, Any]], limit: int = 10) -> List[Dict[str, Any]]:
        """
        Find relevant notes using in-memory semantic similarity.
        No Firebase required!
        """
        # Compute similarity score for each note
        scored_notes = []
        for note in context_notes:
            # Combine title and content for similarity matching
            note_text = f"{note['title']} {note['content']}"
            similarity = self._compute_similarity(question, note_text)
            
            scored_notes.append({
                'note': note,
                'similarity': similarity,
                'score': similarity
            })
        
        # Sort by similarity (highest first)
        scored_notes.sort(key=lambda x: x['similarity'], reverse=True)
        
        # Add similarity score to notes for debugging
        result = []
        for item in scored_notes[:limit]:
            note_copy = item['note'].copy()
            note_copy['_similarity_score'] = item['similarity']
            result.append(note_copy)
        
        return result
    
    def _query_ai_wrapper(self, question: str, context_notes: List[Dict[str, Any]]) -> str:
        """
        Query the AI using in-memory semantic similarity (NO FIREBASE REQUIRED).
        
        This implementation:
        1. If use_semantic_search is enabled: Uses in-memory semantic similarity to find relevant notes
        2. If use_semantic_search is disabled: Skips note retrieval and queries AI directly
        3. Passes the question + relevant context (or just question) to Gemini
        4. Returns the AI's answer
        """
        try:
            use_semantic = self.config['settings'].get('use_semantic_search', True)
            
            if use_semantic:
                # Step 1: Use in-memory semantic search to find relevant notes
                print(f"[SEMANTIC SEARCH] Finding relevant notes for: '{question}'")
                max_context = self.config['settings'].get('max_context_notes', 10)
                relevant_notes = self._find_relevant_notes(question, context_notes, limit=max_context)
                
                print(f"[SEMANTIC SEARCH] Found {len(relevant_notes)} relevant notes")
                if relevant_notes and '_similarity_score' in relevant_notes[0]:
                    top_score = relevant_notes[0]['_similarity_score']
                    print(f"[SEMANTIC SEARCH] Top similarity score: {top_score:.3f}")
                
                # Step 2: Format the relevant notes for the AI
                if relevant_notes:
                    context_text = "Relevant Information:\n\n"
                    for i, note in enumerate(relevant_notes, 1):
                        context_text += f"{i}. {note.get('title', 'Untitled')}\n"
                        context_text += f"   {note.get('content', '')}\n"
                        if '_similarity_score' in note:
                            context_text += f"   (relevance: {note['_similarity_score']:.2f})\n"
                        context_text += "\n"
                else:
                    context_text = "No relevant information found.\n\n"
            else:
                # Send all context notes without filtering
                print(f"[DIRECT QUERY] Sending all {len(context_notes)} notes for: '{question}'")
                context_text = self._format_context_for_ai(context_notes)
                relevant_notes = context_notes  # All notes are "relevant" in this mode
            
            # Step 3: Query LLM with the question and context (or just question)
            if not self.api_key:
                print("[WARNING] No OpenRouter API key available")
                print("[INFO] Using simple answer extraction from context")
                # Try to extract answer from context
                return self._extract_answer_from_context(question, relevant_notes)
            
            if use_semantic:
                content = f"{context_text}\nQuestion: {question}\n\nPlease answer the question concisely based on the relevant information provided above."
            else:
                content = f"{context_text}\nQuestion: {question}\n\nPlease answer the question concisely based on the information provided above."
            
            messages = [{
                'role': 'user',
                'content': content
            }]
            
            print(f"[OPENROUTER] Querying {self.default_model}...")
            answer, usage = self._call_llm(messages, model=self.default_model)
            
            # Track cost and tokens
            cost = self._calculate_cost(usage, self.default_model)
            self.total_cost += cost
            self.total_tokens += usage.get('total_tokens', 0)
            
            print(f"[OPENROUTER] AI Response: {answer[:100]}..." if len(answer) > 100 else f"[OPENROUTER] AI Response: {answer}")
            print(f"[COST] This call: ${cost:.6f} ({usage.get('total_tokens', 0)} tokens)")
            
            return answer
            
        except Exception as e:
            print(f"[ERROR] AI query failed: {e}")
            import traceback
            traceback.print_exc()
            return f"ERROR: {str(e)}"
    
    def _extract_answer_from_context(self, question: str, notes: List[Dict[str, Any]]) -> str:
        """Extract answer from context when no API key is available."""
        if not notes:
            return "No relevant information found to answer the question."
        
        # Return the content of the most relevant note
        top_note = notes[0]
        return f"Based on the information: {top_note.get('content', 'No content')}"
    
    def _call_llm(self, messages: List[Dict[str, str]], model: Optional[str] = None, temperature: float = 0.7) -> tuple[str, Dict[str, Any]]:
        """Call LLM via OpenRouter API with retry logic.
        
        Returns: (content, usage_info) where usage_info contains token counts and cost info
        """
        if not _requests_available:
            return "ERROR: requests library not installed"
        
        if not model:
            model = self.default_model
        
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                import requests
                
                # Use OpenRouter API
                url = "https://openrouter.ai/api/v1/chat/completions"
                
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/joan-code6/zen_ai",  # Optional but recommended
                    "X-Title": "Zen AI Benchmark"  # Optional but recommended
                }
                
                data = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": 1024
                }
                
                response = requests.post(
                    url,
                    headers=headers,
                    json=data,
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if 'choices' in result and len(result['choices']) > 0:
                        choice = result['choices'][0]
                        if 'message' in choice and 'content' in choice['message']:
                            content = choice['message']['content']
                            usage = result.get('usage', {})
                            return content, usage
                    
                    return "ERROR: Unexpected response format from OpenRouter", {}
                else:
                    print(f"[ERROR] OpenRouter API returned status {response.status_code} (attempt {attempt+1}/{max_retries})")
                    print(f"[ERROR] Response: {response.text[:200]}")
                    if attempt < max_retries - 1:
                        print(f"[RETRY] Retrying in 2 seconds...")
                        time.sleep(2)
                        continue
                    return f"ERROR: OpenRouter API error {response.status_code}", {}
                    
            except Exception as e:
                print(f"[ERROR] OpenRouter API call failed (attempt {attempt+1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    print(f"[RETRY] Retrying in 2 seconds...")
                    time.sleep(2)
                    continue
                return f"ERROR: {str(e)}", {}
    
    def _judge_response(self, question: str, expected_answer: str, 
                       actual_answer: str) -> bool:
        """
        Use LLM judge (via OpenRouter) to evaluate if the answer is correct.
        
        Returns: True if correct, False otherwise
        """
        if not self.api_key:
            print("[WARNING] No OpenRouter API key for judge, using simple string matching")
            return expected_answer.lower() in actual_answer.lower()
        
        import time
        
        judge_prompt = f"""You are an evaluation judge. Determine if the given answer correctly responds to the question.

Question: {question}
Expected Answer: {expected_answer}
Actual Answer: {actual_answer}

Compare the actual answer with the expected answer. If the actual answer contains the correct information (even if phrased differently), respond with "correct". If the answer is wrong or doesn't contain the expected information, respond with "incorrect".

Only respond with one word: either "correct" or "incorrect" (no other text).

Evaluation:"""
        
        max_retries = 10  # Retry up to 10 times (about 10 minutes with 1-minute delays)
        for attempt in range(max_retries):
            try:
                print(f"[JUDGE] Evaluating response with {self.judge_model}... (attempt {attempt+1}/{max_retries})")
                messages = [{'role': 'user', 'content': judge_prompt}]
                
                judgment, usage = self._call_llm(messages, model=self.judge_model, temperature=0.0)
                
                # Track cost and tokens for judgment calls
                cost = self._calculate_cost(usage, self.judge_model)
                self.total_cost += cost
                self.total_tokens += usage.get('total_tokens', 0)
                
                judgment_clean = judgment.strip().lower()
                print(f"[JUDGE] Judgment: {judgment_clean}")
                print(f"[COST] Judge call: ${cost:.6f} ({usage.get('total_tokens', 0)} tokens)")
                
                # Parse the judgment - be precise to avoid false positives
                # First check for "incorrect" (since it contains "correct")
                if judgment_clean.startswith("incorrect") or judgment_clean == "incorrect":
                    return False
                elif judgment_clean.startswith("correct") or judgment_clean == "correct":
                    return True
                else:
                    # If unclear, retry after 1 minute
                    print(f"[JUDGE] Unclear judgment '{judgment_clean}', retrying in 1 minute...")
                    if attempt < max_retries - 1:
                        time.sleep(60)  # Wait 1 minute
                        continue
                    else:
                        print("[JUDGE] Max retries reached, using fallback")
                        return expected_answer.lower() in actual_answer.lower()
                        
            except Exception as e:
                print(f"[ERROR] LLM judge failed: {e}")
                if attempt < max_retries - 1:
                    print(f"[JUDGE] Retrying in 1 minute...")
                    time.sleep(60)  # Wait 1 minute
                    continue
                else:
                    print("[FALLBACK] Using simple string matching")
                    return expected_answer.lower() in actual_answer.lower()
    
    def run_benchmark(self, max_tests: Optional[int] = None) -> Dict[str, Any]:
        """Run the complete benchmark suite."""
        print("=" * 80)
        print("BENCHMARK: Needle in a Haystack - AI Wrapper Test")
        print("=" * 80)
        print(f"Dataset: {self.config['dataset']['path']}")
        print(f"Test Cases: {len(self.dataset['test_cases'])}")
        print(f"Useless Notes per Test: {self.config['settings']['num_useless_notes_to_append']}")
        print("=" * 80)
        print()
        
        test_cases_to_run = self.dataset['test_cases']
        if max_tests is not None:
            test_cases_to_run = test_cases_to_run[:max_tests]
            print(f"Limited to first {max_tests} test cases")
        
        # Create comprehensive results with metadata
        results = {
            # Metadata
            'metadata': {
                'benchmark_name': 'Needle in a Haystack - AI Wrapper Test',
                'version': '1.0',
                'timestamp': datetime.datetime.now().isoformat(),
                'run_parameters': {
                    'max_tests': max_tests,
                    'total_available_tests': len(self.dataset['test_cases'])
                }
            },
            
            # Configuration used for this run
            'configuration': {
                'dataset': self.config['dataset'],
                'settings': self.config['settings']
            },
            
            # Results summary
            'summary': {
                'total_tests': len(test_cases_to_run),
                'passed': 0,
                'failed': 0,
                'success_rate': 0.0
            },
            
            # Detailed test results
            'test_results': [],
            
            # Cost and usage tracking
            'cost_and_usage': {
                'total_cost': 0.0,
                'total_tokens': 0,
                'cost_breakdown': {
                    'query_calls': 0,
                    'judge_calls': 0
                }
            }
        }
        
        for test_case in test_cases_to_run:
            print(f"\nRunning Test: {test_case['id']}")
            print(f"Question: {test_case['question']}")
            
            # Prepare context with all notes (important, trick, and useless)
            context_notes = self._prepare_context(test_case)
            
            print(f"Context prepared: {len(context_notes)} total notes")
            print(f"  - Important notes: {len(test_case['important_notes'])}")
            print(f"  - Trick notes: {len(test_case['trick_notes'])}")
            print(f"  - Useless notes: {min(len(self.useless_notes), self.config['settings']['num_useless_notes_to_append'])}")
            
            # Query the AI wrapper
            actual_answer = self._query_ai_wrapper(test_case['question'], context_notes)
            
            # Judge the response
            is_correct = self._judge_response(
                test_case['question'],
                test_case['answer'],
                actual_answer
            )
            
            # Record results with comprehensive information
            test_result = {
                'id': test_case['id'],
                'question': test_case['question'],
                'expected_answer': test_case['answer'],
                'ai_answer': actual_answer,  # More explicit naming
                'correct': is_correct,
                'context_info': {
                    'total_notes': len(context_notes),
                    'important_notes': len(test_case['important_notes']),
                    'trick_notes': len(test_case['trick_notes']),
                    'useless_notes': min(len(self.useless_notes), self.config['settings']['num_useless_notes_to_append'])
                },
                'test_case_details': {
                    'important_notes': test_case['important_notes'],
                    'trick_notes': test_case['trick_notes']
                }
            }
            results['test_results'].append(test_result)
            
            if is_correct:
                results['summary']['passed'] += 1
                print(f"✓ PASSED")
            else:
                results['summary']['failed'] += 1
                print(f"✗ FAILED")
        
        # Calculate final summary
        success_rate = (results['summary']['passed'] / results['summary']['total_tests'] * 100) if results['summary']['total_tests'] > 0 else 0.0
        results['summary']['success_rate'] = success_rate
        
        # Print summary
        print("\n" + "=" * 80)
        print("BENCHMARK RESULTS")
        print("=" * 80)
        print(f"Total Tests: {results['summary']['total_tests']}")
        print(f"Passed: {results['summary']['passed']}")
        print(f"Failed: {results['summary']['failed']}")
        print(f"Success Rate: {success_rate:.2f}%")
        print(f"Total Cost: ${self.total_cost:.4f}")
        print(f"Total Tokens: {self.total_tokens}")
        print("=" * 80)
        
        # Add cost information to results
        results['cost_and_usage']['total_cost'] = self.total_cost
        results['cost_and_usage']['total_tokens'] = self.total_tokens
        
        return results
    
    def save_results(self, results: Dict[str, Any], output_path: str = None):
        """Save benchmark results to a file."""
        if output_path is None:
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            output_path = f"results/results_{timestamp}.json"
        
        output_file = Path(__file__).parent / output_path
        try:
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\nResults saved to: {output_file}")
        except IOError as e:
            print(f"\nWarning: Failed to save results to {output_file}: {e}")


def main():
    """Main entry point for the benchmark runner."""
    parser = argparse.ArgumentParser(description="Run AI benchmark tests")
    parser.add_argument(
        '--max-tests',
        type=int,
        help='Maximum number of test cases to run (default: all)'
    )
    
    args = parser.parse_args()
    
    print("Initializing Benchmark Runner...")
    print()
    
    runner = StandaloneBenchmarkRunner()
    
    try:
        results = runner.run_benchmark(max_tests=args.max_tests)
        
        # Determine results filename based on semantic search setting
        use_semantic = runner.config['settings'].get('use_semantic_search', True)
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        base_name = "results_semantic_search_enabled" if use_semantic else "results_semantic_search_disabled"
        results_filename = f"results/{base_name}_{timestamp}.json"
        
        runner.save_results(results, output_path=results_filename)
        
        # Exit with error code if any tests failed
        sys.exit(0 if results['summary']['failed'] == 0 else 1)
    except KeyboardInterrupt:
        print("\n\nBenchmark interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nBenchmark failed with error: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
