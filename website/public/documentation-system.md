# Documentation System

This documentation system uses separate JSON files for each category, with full markdown support and image integration.

## File Structure

- `public/getting-started.json` - Getting started guides
- `public/research.json` - Research and technical details
- `public/advanced-features.json` - Advanced features documentation

## JSON Structure

Each category file has this structure:

```json
{
  "title": "Category Title",
  "items": [
    {
      "id": "unique-id",
      "title": "Page Title",
      "content": "# Markdown content here\n\nWith **formatting** and `code` blocks",
      "code": "npm install example",
      "image": "/images/screenshot.png",
      "note": "Additional note text",
      "keyFindings": ["Finding 1", "Finding 2"]
    }
  ]
}
```

## Markdown Features

- **Headers**: # ## ###
- **Code blocks**: ```language
- **Inline code**: `code`
- **Lists**: - item or 1. item
- **Links**: [text](url)
- **Images**: ![alt](url)
- **Tables**: | col1 | col2 |
- **Blockquotes**: > quote

## Adding Images

Place images in `public/images/` and reference them as `/images/filename.png` in the JSON.

## Navigation

The sidebar automatically generates from all JSON files. Each item gets its own route at `/documentation/{id}`.