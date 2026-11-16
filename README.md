# stash-articles

English | [简体中文](README.zh-CN.md)

A TXT reader and a mobile interface plugin for [Stash](https://github.com/stashapp/stash). Install either plugin independently, or use both together.

| Plugin | Description |
| --- | --- |
| [Articles](plugins/articles) | Read TXT files from nested directories directly in Stash. |
| [Mobile UI](plugins/mobileFilters) | Touch-friendly filters, sorting, display controls, and media playback shortcuts. |

## Requirements

- Stash v0.32.0.
- Python 3 for the Articles plugin, running on Linux or macOS. Native Windows is not supported by the reader.
- The plugins currently use Chinese interface labels.

No frontend build or npm installation is required to use the plugins.

## Installation

1. Download this repository, or clone it:

   ```sh
   git clone https://github.com/xiapazhi/stash-articles.git
   ```

2. Copy the plugin directories you want into your Stash configuration directory:

   ```text
   <stash-config>/plugins/
   ├── articles/
   │   ├── articles.yml
   │   ├── articles.py
   │   ├── articles.js
   │   ├── articles.css
   │   └── reader.json
   └── mobileFilters/
       ├── mobileFilters.yml
       ├── mobileFilters.js
       └── mobileFilters.css
   ```

   Keep the directory and manifest names unchanged. The two plugins can be enabled or disabled separately.

3. For Articles, edit `articles/reader.json` to select your TXT directory:

   ```json
   {
     "root": "/data/文本"
   }
   ```

   Use an absolute path accessible to the Stash process. When using Docker, this is a **container path**: mount your TXT directory into the container first. A read-only mount is recommended. There is no need to add TXT files to Stash's media library or scan them.

4. Reload plugins in **Settings → Plugins**, then refresh the browser.

## Articles

The Articles entry opens `/articles` in Stash.

- Browse TXT files recursively, including nested directories.
- Read UTF-8, GB18030, Big5, and BOM-marked UTF-16 files, with manual encoding selection when needed.
- Open the directory drawer on phones; use the sidebar on desktop.
- Keep a compact title and controls visible while scrolling the text on phones.
- Read files without editing, uploading, renaming, or deleting them.

The reader supports files up to **20 MiB** and lists up to **10,000 articles**. It rejects path traversal, symbolic links, and special files. It does not create Stash media records.

Anyone with access to your Stash instance can read TXT files under the configured root. The plugin uses Stash's access control and does not add separate article permissions. File contents and modification times are preserved; the filesystem may update access times.

## Mobile UI

Mobile UI applies at viewport widths **below 768px** to the main lists for scenes, images, galleries, groups, performers, studios, tags, and scene markers.

- Sticky search, filter, sort, and display controls with touch-friendly buttons.
- Bottom sheets for filters, sorting, view modes, card size, and page size.
- Immediate updates for common filters; advanced filters retain Stash's Apply/Cancel workflow.
- Reset filter criteria while keeping the search term, sort order, and display mode.
- Horizontally scrollable active filter chips and native bulk-selection controls.
- Tap an image thumbnail in grid view to open Stash's lightbox; tap its title for details.
- Tap a scene thumbnail in grid view to open the native player in a modal; tap its title for details.

Desktop layouts and detail pages retain their native behavior. The Mobile UI plugin does not change the Articles layout.

## Development

```sh
npm install
npm test
```

The test suite covers the read-only TXT backend and mobile React component behavior. The plugins use Stash's experimental plugin API; check compatibility when upgrading Stash.

## Uninstall

Disable the plugin in Stash and refresh the browser. To remove it completely, delete its directory from `<stash-config>/plugins/` and reload plugins. Keep your media and TXT directories.
