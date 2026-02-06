#!/usr/bin/env python3
"""
Utility script to manage benchmark datasets and run tests.

Usage:
    python manage_benchmark.py --dataset template
    python manage_benchmark.py --dataset extended
    python manage_benchmark.py --list
    python manage_benchmark.py --info
"""

import argparse
import json
import sys
from pathlib import Path


def load_config():
    """Load the benchmark configuration."""
    config_path = Path(__file__).parent / "config.json"
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: Configuration file not found at {config_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in configuration file: {e}")
        sys.exit(1)


def save_config(config):
    """Save the benchmark configuration."""
    config_path = Path(__file__).parent / "config.json"
    try:
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    except IOError as e:
        print(f"Error: Failed to save configuration: {e}")
        sys.exit(1)


def set_dataset(dataset_name):
    """Set the active dataset."""
    dataset_files = {
        'template': 'datasets/dataset_template.json',
        'extended': 'datasets/dataset_extended.json',
    }
    
    if dataset_name not in dataset_files:
        print(f"Error: Unknown dataset '{dataset_name}'")
        print(f"Available datasets: {', '.join(dataset_files.keys())}")
        sys.exit(1)
    
    config = load_config()
    config['benchmark_config']['dataset']['path'] = dataset_files[dataset_name]
    save_config(config)
    
    print(f"✓ Active dataset set to: {dataset_files[dataset_name]}")


def list_datasets():
    """List all available datasets."""
    benchmark_dir = Path(__file__).parent
    datasets = list((benchmark_dir / "datasets").glob("dataset_*.json"))
    
    config = load_config()
    active_dataset = config['benchmark_config']['dataset']['path']
    
    print("Available datasets:")
    print("-" * 50)
    
    for dataset in datasets:
        try:
            with open(dataset, 'r') as f:
                data = json.load(f)
                num_cases = len(data.get('test_cases', []))
                is_active = "← ACTIVE" if dataset.name == active_dataset else ""
                
            print(f"  {dataset.name:30} ({num_cases} test cases) {is_active}")
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"  {dataset.name:30} (ERROR: {e})")


def show_info():
    """Show information about the current configuration."""
    config = load_config()
    settings = config['benchmark_config']['settings']
    dataset_info = config['benchmark_config']['dataset']
    
    dataset_path = Path(__file__).parent / dataset_info['path']
    try:
        with open(dataset_path, 'r') as f:
            dataset = json.load(f)
    except FileNotFoundError:
        print(f"Error: Dataset file '{dataset_info['path']}' not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in dataset file: {e}")
        sys.exit(1)
    
    print("=" * 60)
    print("BENCHMARK CONFIGURATION")
    print("=" * 60)
    print(f"Active Dataset: {dataset_info['path']}")
    print(f"Test Cases: {len(dataset['test_cases'])}")
    print(f"Useless Notes to Append: {settings['num_useless_notes_to_append']}")
    print(f"Max Context Notes: {settings['max_context_notes']}")
    print(f"Use Semantic Search: {settings['use_semantic_search']}")
    print(f"Similarity Threshold: {settings['similarity_threshold']}")
    print()
    print("Model Configuration:")
    print(f"  Use OpenRouter: {settings['model_selection']['use_openrouter']}")
    print(f"  Default Model: {settings['model_selection']['default_model']}")
    print(f"  Judge Model: {settings['model_selection']['judge_model']}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Manage benchmark datasets and configuration"
    )
    
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        '--dataset',
        choices=['template', 'extended'],
        help='Set the active dataset'
    )
    group.add_argument(
        '--list',
        action='store_true',
        help='List all available datasets'
    )
    group.add_argument(
        '--info',
        action='store_true',
        help='Show current configuration info'
    )
    
    args = parser.parse_args()
    
    if args.dataset:
        set_dataset(args.dataset)
    elif args.list:
        list_datasets()
    elif args.info:
        show_info()


if __name__ == "__main__":
    main()
